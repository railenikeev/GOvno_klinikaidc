package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID                 int     `json:"id"`
	FullName           string  `json:"full_name"`
	Email              string  `json:"email"`
	Phone              string  `json:"phone"`
	Role               string  `json:"role"`
	SpecializationID   *int    `json:"specialization_id,omitempty"`
	SpecializationName *string `json:"specialization_name,omitempty"`
}

type Specialization struct {
	ID   int    `json:"id"`
	Name string `json:"name" binding:"required,min=2"`
}

type UpdateUserAdminRequest struct {
	Role             string `json:"role" binding:"required,oneof=patient doctor admin"`
	SpecializationID *int   `json:"specialization_id"`
}

var jwtSecret = []byte(os.Getenv("JWT_SECRET"))

func init() {
	if len(jwtSecret) == 0 {
		log.Println("ПРЕДУПРЕЖДЕНИЕ: JWT_SECRET не установлена, используется 'supersecret'.")
		jwtSecret = []byte("supersecret")
	}
}

func getUserInfoFromHeader(c *gin.Context) (userID int, userRole string, err error) {
	idStr := c.GetHeader("X-User-ID")
	role := c.GetHeader("X-User-Role")
	if idStr == "" || role == "" {
		err = errors.New("заголовки X-User-ID/X-User-Role отсутствуют")
		return
	}
	userID, err = strconv.Atoi(idStr)
	if err != nil {
		err = errors.New("ошибка обработки X-User-ID")
		return
	}
	userRole = role
	return
}

func adminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		_, role, err := getUserInfoFromHeader(c)
		if err != nil {
			log.Printf("ADMIN AUTH ERROR: %v", err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Ошибка аутентификации"})
			c.Abort()
			return
		}
		if role != "admin" {
			log.Printf("ADMIN AUTH WARN: Попытка доступа ролью '%s'", role)
			c.JSON(http.StatusForbidden, gin.H{"error": "Доступ запрещен"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func extractUserIDFromToken(tokenStr string) (int, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("неожиданный метод подписи: %v", t.Header["alg"])
		}
		return jwtSecret, nil
	})
	if err != nil || !token.Valid {
		log.Printf("Ошибка валидации токена: %v", err)
		return 0, errors.New("некорректный или просроченный токен")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, errors.New("неверный формат claims в токене")
	}
	rawUserID, ok := claims["user_id"]
	if !ok {
		return 0, errors.New("user_id не найден в токене")
	}
	userIDFloat, ok := rawUserID.(float64)
	if !ok {
		return 0, errors.New("user_id в токене не является числом")
	}
	return int(userIDFloat), nil
}

func getSpecializationsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var specializations []Specialization
		query := "SELECT id, name FROM specializations ORDER BY name"
		rows, err := db.Query(query)
		if err != nil {
			log.Printf("Users ERROR: Ошибка БД (getSpecializations): %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		defer rows.Close()
		for rows.Next() {
			var s Specialization
			if errScan := rows.Scan(&s.ID, &s.Name); errScan != nil {
				log.Printf("Users ERROR: Ошибка сканирования spec: %v", errScan)
				continue
			}
			specializations = append(specializations, s)
		}
		if err = rows.Err(); err != nil {
			log.Printf("Users ERROR: Ошибка итерации spec: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		c.JSON(http.StatusOK, specializations)
	}
}

func createSpecializationHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var newSpec Specialization
		if err := c.ShouldBindJSON(&newSpec); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}
		query := "INSERT INTO specializations (name) VALUES ($1) RETURNING id"
		err := db.QueryRow(query, newSpec.Name).Scan(&newSpec.ID)
		if err != nil {
			if strings.Contains(err.Error(), "duplicate key") {
				c.JSON(http.StatusConflict, gin.H{"error": "Специализация с таким названием уже существует"})
				return
			}
			log.Printf("Users ERROR: Ошибка БД (createSpec): %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		log.Printf("Users INFO: Создана специализация ID %d, Name: %s", newSpec.ID, newSpec.Name)
		c.JSON(http.StatusCreated, newSpec)
	}
}

func updateSpecializationHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		idStr := c.Param("id")
		specID, err := strconv.Atoi(idStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID специализации"})
			return
		}
		var updatedSpec Specialization
		if err = c.ShouldBindJSON(&updatedSpec); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}
		query := "UPDATE specializations SET name = $1 WHERE id = $2 RETURNING id, name"
		err = db.QueryRow(query, updatedSpec.Name, specID).Scan(&updatedSpec.ID, &updatedSpec.Name)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Специализация не найдена"})
				return
			}
			if strings.Contains(err.Error(), "duplicate key") {
				c.JSON(http.StatusConflict, gin.H{"error": "Специализация с таким названием уже существует"})
				return
			}
			log.Printf("Users ERROR: Ошибка БД (updateSpec %d): %v", specID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		log.Printf("Users INFO: Обновлена специализация ID %d, Name: %s", updatedSpec.ID, updatedSpec.Name)
		c.JSON(http.StatusOK, updatedSpec)
	}
}

func deleteSpecializationHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		idStr := c.Param("id")
		specID, err := strconv.Atoi(idStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID специализации"})
			return
		}
		var userCount int
		checkQuery := "SELECT COUNT(*) FROM users WHERE specialization_id = $1"
		err = db.QueryRow(checkQuery, specID).Scan(&userCount)
		if err != nil {
			log.Printf("Users ERROR: Ошибка проверки использования spec %d: %v", specID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		if userCount > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("Нельзя удалить специализацию, используется %d врачом(ами)", userCount)})
			return
		}
		deleteQuery := "DELETE FROM specializations WHERE id = $1"
		result, err := db.Exec(deleteQuery, specID)
		if err != nil {
			log.Printf("Users ERROR: Ошибка БД (deleteSpec %d): %v", specID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Специализация не найдена"})
			return
		}
		log.Printf("Users INFO: Удалена специализация ID %d", specID)
		c.Status(http.StatusNoContent)
	}
}

func getUsersHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		roleFilter := c.Query("role")
		var users []User
		var rows *sql.Rows
		var err error
		baseQuery := `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.specialization_id, s.name as specialization_name FROM users u LEFT JOIN specializations s ON u.specialization_id = s.id`
		var queryArgs []interface{}
		if roleFilter != "" {
			baseQuery += " WHERE u.role = $1"
			queryArgs = append(queryArgs, roleFilter)
		}
		baseQuery += " ORDER BY u.full_name"
		rows, err = db.Query(baseQuery, queryArgs...)
		if err != nil {
			log.Printf("Users ERROR: Ошибка БД (getUsers): %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		defer rows.Close()
		for rows.Next() {
			var u User
			var specID sql.NullInt64
			var specName sql.NullString
			if errScan := rows.Scan(&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role, &specID, &specName); errScan != nil {
				log.Printf("Users ERROR: Ошибка сканирования user: %v", errScan)
				continue
			}
			if specID.Valid {
				id := int(specID.Int64)
				u.SpecializationID = &id
			}
			if specName.Valid {
				name := specName.String
				u.SpecializationName = &name
			}
			users = append(users, u)
		}
		if err = rows.Err(); err != nil {
			log.Printf("Users ERROR: Ошибка итерации users: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		c.JSON(http.StatusOK, users)
	}
}

func registerHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			FullName         string `json:"full_name" binding:"required"`
			Email            string `json:"email" binding:"required,email"`
			Password         string `json:"password" binding:"required,min=6"`
			Phone            string `json:"phone" binding:"required"`
			Role             string `json:"role" binding:"required,oneof=patient doctor admin"`
			SpecializationID *int   `json:"specialization_id"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}
		if req.Role == "doctor" && req.SpecializationID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Для роли 'doctor' требуется указать specialization_id"})
			return
		}
		if req.Role != "doctor" {
			req.SpecializationID = nil
		} else {
			var exists bool
			errCheckSpec := db.QueryRow("SELECT EXISTS(SELECT 1 FROM specializations WHERE id = $1)", *req.SpecializationID).Scan(&exists)
			if errCheckSpec != nil {
				log.Printf("Users ERROR: Ошибка проверки spec_id %d: %v", *req.SpecializationID, errCheckSpec)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
				return
			}
			if !exists {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Специализация с ID %d не найдена", *req.SpecializationID)})
				return
			}
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("Ошибка хэширования: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Внутренняя ошибка"})
			return
		}
		var userID int
		err = db.QueryRow(`INSERT INTO users (full_name, email, password_hash, phone, role, specialization_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
			req.FullName, req.Email, string(hash), req.Phone, req.Role, req.SpecializationID).Scan(&userID)
		if err != nil {
			if strings.Contains(err.Error(), "duplicate key") {
				c.JSON(http.StatusConflict, gin.H{"error": "Пользователь с таким email или телефоном уже существует"})
				return
			}
			log.Printf("Ошибка БД (register): %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка регистрации"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"id": userID, "message": "Пользователь успешно зарегистрирован"})
	}
}

func loginHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Email    string `json:"email" binding:"required,email"`
			Password string `json:"password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}
		var id int
		var hash, role string
		var err error
		err = db.QueryRow(`SELECT id, password_hash, role FROM users WHERE email = $1`, req.Email).Scan(&id, &hash, &role)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Неверные учётные данные"})
				return
			}
			log.Printf("Ошибка БД (login): %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Внутренняя ошибка"})
			return
		}
		err = bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password))
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Неверные учётные данные"})
			return
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"user_id": id, "exp": time.Now().Add(24 * time.Hour).Unix()})
		tokenString, err := token.SignedString(jwtSecret)
		if err != nil {
			log.Printf("Ошибка подписи токена: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Внутренняя ошибка"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"token": tokenString, "user_id": id, "role": role})
	}
}

func getMeHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDVal, exists := c.Get("userID")
		if !exists {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось получить userID"})
			return
		}
		userID := userIDVal.(int)
		var u User
		var specID sql.NullInt64
		var specName sql.NullString
		query := `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.specialization_id, s.name as specialization_name FROM users u LEFT JOIN specializations s ON u.specialization_id = s.id WHERE u.id = $1`
		err := db.QueryRow(query, userID).Scan(&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role, &specID, &specName)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
				return
			}
			log.Printf("Ошибка БД (getMe %d): %v", userID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения профиля"})
			return
		}
		if specID.Valid {
			id := int(specID.Int64)
			u.SpecializationID = &id
		}
		if specName.Valid {
			name := specName.String
			u.SpecializationName = &name
		}
		c.JSON(http.StatusOK, u)
	}
}

func getUserByIdHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := c.Param("id")
		targetUserID, err := strconv.Atoi(userIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат ID"})
			return
		}
		var u User
		var specID sql.NullInt64
		var specName sql.NullString
		query := `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.specialization_id, s.name as specialization_name FROM users u LEFT JOIN specializations s ON u.specialization_id = s.id WHERE u.id = $1`
		err = db.QueryRow(query, targetUserID).Scan(&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role, &specID, &specName)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
				return
			}
			log.Printf("Ошибка БД (getUserById %d): %v", targetUserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения данных"})
			return
		}
		if specID.Valid {
			id := int(specID.Int64)
			u.SpecializationID = &id
		}
		if specName.Valid {
			name := specName.String
			u.SpecializationName = &name
		}
		c.JSON(http.StatusOK, u)
	}
}

func updateUserHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := c.Param("id")
		userIDToUpdate, err := strconv.Atoi(userIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID пользователя"})
			return
		}
		requestUserID, _, errAuth := getUserInfoFromHeader(c)
		if errAuth != nil {
			log.Printf("ADMIN AUTH ERROR (updateUser): %v", errAuth)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Ошибка аутентификации"})
			return
		}
		if requestUserID == userIDToUpdate {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Нельзя редактировать свой профиль этим методом"})
			return
		}
		var req UpdateUserAdminRequest
		if err = c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}

		if req.Role == "doctor" {
			if req.SpecializationID == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Для роли 'doctor' необходимо указать specialization_id"})
				return
			}
			var exists bool
			errCheckSpec := db.QueryRow("SELECT EXISTS(SELECT 1 FROM specializations WHERE id = $1)", *req.SpecializationID).Scan(&exists)
			if errCheckSpec != nil {
				log.Printf("Users ERROR: Ошибка проверки spec_id %d: %v", *req.SpecializationID, errCheckSpec)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
				return
			}
			if !exists {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Специализация с ID %d не найдена", *req.SpecializationID)})
				return
			}
		} else {
			req.SpecializationID = nil
		}

		query := `UPDATE users SET role = $1, specialization_id = $2 WHERE id = $3 RETURNING id`
		var updatedID int
		err = db.QueryRow(query, req.Role, req.SpecializationID, userIDToUpdate).Scan(&updatedID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Пользователь для обновления не найден"})
				return
			}
			log.Printf("Users ERROR: Ошибка БД (updateUser %d): %v", userIDToUpdate, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		var u User
		var specID sql.NullInt64
		var specName sql.NullString
		selectQuery := `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.specialization_id, s.name as specialization_name FROM users u LEFT JOIN specializations s ON u.specialization_id = s.id WHERE u.id = $1`
		err = db.QueryRow(selectQuery, updatedID).Scan(&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role, &specID, &specName)
		if err != nil {
			log.Printf("Users ERROR: Не удалось получить обновл. данные user %d: %v", updatedID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения обновленных данных"})
			return
		}
		if specID.Valid {
			id := int(specID.Int64)
			u.SpecializationID = &id
		}
		if specName.Valid {
			name := specName.String
			u.SpecializationName = &name
		}
		log.Printf("Users INFO: Admin обновил user ID %d (Role: %s, SpecID: %v)", u.ID, u.Role, u.SpecializationID)
		c.JSON(http.StatusOK, u)
	}
}

func deleteUserHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := c.Param("id")
		userIDToDelete, err := strconv.Atoi(userIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID пользователя"})
			return
		}
		requestUserID, _, errAuth := getUserInfoFromHeader(c)
		if errAuth != nil {
			log.Printf("ADMIN AUTH ERROR (deleteUser): %v", errAuth)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Ошибка аутентификации"})
			return
		}
		if requestUserID == userIDToDelete {
			c.JSON(http.StatusForbidden, gin.H{"error": "Нельзя удалить свой собственный аккаунт"})
			return
		}

		query := "DELETE FROM users WHERE id = $1"
		result, err := db.Exec(query, userIDToDelete)
		if err != nil {
			if strings.Contains(err.Error(), "violates foreign key constraint") {
				log.Printf("Users WARN: Не удалось удалить user %d из-за FK: %v", userIDToDelete, err)
				c.JSON(http.StatusConflict, gin.H{"error": "Невозможно удалить пользователя, есть связанные данные"})
				return
			}
			log.Printf("Users ERROR: Ошибка БД (deleteUser %d): %v", userIDToDelete, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
			return
		}
		log.Printf("Users INFO: Администратор удалил пользователя ID %d", userIDToDelete)
		c.Status(http.StatusNoContent)
	}
}

/* ──────────────── Main ──────────────── */
func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL не задана")
	}
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Ошибка подключения к БД: %v", err)
	}
	defer db.Close()
	if err = db.Ping(); err != nil {
		log.Fatalf("Ошибка пинга БД: %v", err)
	}
	log.Println("Успешное подключение к БД!")

	r := gin.Default()

	r.POST("/register", registerHandler(db))
	r.POST("/login", loginHandler(db))
	r.GET("/users", getUsersHandler(db))
	r.GET("/specializations", getSpecializationsHandler(db))

	authRequired := func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Отсутствует заголовок Authorization"})
			c.Abort()
			return
		}
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Некорректный формат заголовка Authorization"})
			c.Abort()
			return
		}
		userID, err := extractUserIDFromToken(parts[1])
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			c.Abort()
			return
		}
		c.Set("userID", userID)
		c.Next()
	}
	r.GET("/me", authRequired, getMeHandler(db))

	r.GET("/users/:id", getUserByIdHandler(db))

	adminRoutes := r.Group("/")
	adminRoutes.Use(adminRequired())
	{
		adminRoutes.POST("/specializations", createSpecializationHandler(db))
		adminRoutes.PUT("/specializations/:id", updateSpecializationHandler(db))
		adminRoutes.DELETE("/specializations/:id", deleteSpecializationHandler(db))
		adminRoutes.PATCH("/users/:id", updateUserHandler(db))
		adminRoutes.DELETE("/users/:id", deleteUserHandler(db))
	}

	port := ":8080"
	log.Printf("Users service запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска Users service: %v", err)
	}
}
