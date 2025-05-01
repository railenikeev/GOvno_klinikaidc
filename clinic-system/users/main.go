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
	_ "github.com/lib/pq" // Драйвер PostgreSQL
	"golang.org/x/crypto/bcrypt"
)

/* ──────────────── Модели ──────────────── */

// User - основная структура пользователя для JSON ответов
type User struct {
	ID                 int     `json:"id"`
	FullName           string  `json:"full_name"`
	Email              string  `json:"email"`
	Phone              string  `json:"phone"`
	Role               string  `json:"role"`
	SpecializationID   *int    `json:"specialization_id,omitempty"`
	SpecializationName *string `json:"specialization_name,omitempty"`
}

// Specialization - структура для специализации
type Specialization struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

/* ──────────────── JWT ──────────────── */

var jwtSecret = []byte(os.Getenv("JWT_SECRET"))

func init() {
	if len(jwtSecret) == 0 {
		log.Println("ПРЕДУПРЕЖДЕНИЕ: Переменная окружения JWT_SECRET не установлена, используется значение по умолчанию 'supersecret'.")
		jwtSecret = []byte("supersecret")
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

/* --- Обработчик для GET /specializations --- */
func getSpecializationsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		specializations := []Specialization{}
		query := "SELECT id, name FROM specializations ORDER BY name"

		rows, err := db.Query(query)
		if err != nil {
			log.Printf("Users ERROR: Ошибка БД при получении списка специализаций: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при получении специализаций"})
			return
		}
		defer rows.Close()

		for rows.Next() {
			var s Specialization
			if err := rows.Scan(&s.ID, &s.Name); err != nil {
				log.Printf("Users ERROR: Ошибка сканирования специализации: %v", err)
				continue
			}
			specializations = append(specializations, s)
		}

		if err = rows.Err(); err != nil {
			log.Printf("Users ERROR: Ошибка после чтения строк специализаций: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при обработке списка специализаций"})
			return
		}
		c.JSON(http.StatusOK, specializations)
	}
}

/* --- Обработчик для GET /users --- */
func getUsersHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		roleFilter := c.Query("role")
		users := []User{}
		var rows *sql.Rows
		var err error

		baseQuery := `
            SELECT u.id, u.full_name, u.email, u.phone, u.role, u.specialization_id, s.name as specialization_name
            FROM users u
            LEFT JOIN specializations s ON u.specialization_id = s.id`
		queryArgs := []interface{}{}
		if roleFilter != "" {
			baseQuery += " WHERE u.role = $1"
			queryArgs = append(queryArgs, roleFilter)
		}
		baseQuery += " ORDER BY u.full_name"

		rows, err = db.Query(baseQuery, queryArgs...)
		if err != nil {
			log.Printf("Users ERROR: Ошибка БД при получении списка пользователей (role: %s): %v", roleFilter, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при получении пользователей"})
			return
		}
		defer rows.Close()

		for rows.Next() {
			var u User
			var specializationID sql.NullInt64
			var specializationName sql.NullString
			if err := rows.Scan(&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role, &specializationID, &specializationName); err != nil {
				log.Printf("Users ERROR: Ошибка сканирования пользователя при получении списка: %v", err)
				continue
			}
			if specializationID.Valid {
				id := int(specializationID.Int64)
				u.SpecializationID = &id
			}
			if specializationName.Valid {
				name := specializationName.String
				u.SpecializationName = &name
			}
			users = append(users, u)
		}
		if err = rows.Err(); err != nil {
			log.Printf("Users ERROR: Ошибка после чтения строк пользователей (role: %s): %v", roleFilter, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при обработке списка пользователей"})
			return
		}
		c.JSON(http.StatusOK, users)
	}
}

/* ──────────────── Main ──────────────── */
func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("Переменная окружения DATABASE_URL не задана")
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

	/* ---------- Регистрация ---------- */
	r.POST("/register", func(c *gin.Context) {
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
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("Ошибка при хэшировании пароля: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Внутренняя ошибка сервера"})
			return
		}
		var userID int
		err = db.QueryRow(`INSERT INTO users (full_name, email, password_hash, phone, role, specialization_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
			req.FullName, req.Email, string(hash), req.Phone, req.Role, req.SpecializationID).Scan(&userID)
		if err != nil {
			if strings.Contains(err.Error(), "duplicate key value violates unique constraint") {
				c.JSON(http.StatusConflict, gin.H{"error": "Пользователь с таким email или телефоном уже существует"})
				return
			}
			log.Printf("Ошибка БД при регистрации пользователя: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при регистрации пользователя"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"id": userID, "message": "Пользователь успешно зарегистрирован"})
	})

	/* ---------- Вход ---------- */
	r.POST("/login", func(c *gin.Context) {
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
		err = db.QueryRow(`SELECT id, password_hash, role FROM users WHERE email = $1`, req.Email).Scan(&id, &hash, &role)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Неверные учётные данные"})
				return
			}
			log.Printf("Ошибка БД при поиске пользователя: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Внутренняя ошибка сервера"})
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
			log.Printf("Ошибка при подписании токена: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Внутренняя ошибка сервера"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"token": tokenString, "user_id": id, "role": role})
	})

	/* ---------- Получение списка пользователей ---------- */
	r.GET("/users", getUsersHandler(db))

	/* ---------- Получение списка специализаций ---------- */
	r.GET("/specializations", getSpecializationsHandler(db))

	/* ---------- Middleware для аутентификации ---------- */
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

	/* ---------- Профиль текущего пользователя (/me) ---------- */
	r.GET("/me", authRequired, func(c *gin.Context) {
		userIDVal, exists := c.Get("userID")
		if !exists {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось получить userID из контекста"})
			return
		}
		userID := userIDVal.(int)
		var u User
		var specializationID sql.NullInt64
		var specializationName sql.NullString
		query := `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.specialization_id, s.name as specialization_name FROM users u LEFT JOIN specializations s ON u.specialization_id = s.id WHERE u.id = $1`
		err := db.QueryRow(query, userID).Scan(&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role, &specializationID, &specializationName)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
				return
			}
			log.Printf("Ошибка БД при получении профиля пользователя %d: %v", userID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении профиля"})
			return
		}
		if specializationID.Valid {
			id := int(specializationID.Int64)
			u.SpecializationID = &id
		}
		if specializationName.Valid {
			name := specializationName.String
			u.SpecializationName = &name
		}
		c.JSON(http.StatusOK, u)
	})

	/* ---------- Получение пользователя по ID (/users/:id) ---------- */
	r.GET("/users/:id", func(c *gin.Context) {
		userIDStr := c.Param("id")
		targetUserID, err := strconv.Atoi(userIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат ID пользователя"})
			return
		}
		var u User
		var specializationID sql.NullInt64
		var specializationName sql.NullString
		query := `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.specialization_id, s.name as specialization_name FROM users u LEFT JOIN specializations s ON u.specialization_id = s.id WHERE u.id = $1`
		err = db.QueryRow(query, targetUserID).Scan(&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role, &specializationID, &specializationName)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
				return
			}
			log.Printf("Ошибка БД при получении пользователя по ID %d: %v", targetUserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении данных пользователя"})
			return
		}
		if specializationID.Valid {
			id := int(specializationID.Int64)
			u.SpecializationID = &id
		}
		if specializationName.Valid {
			name := specializationName.String
			u.SpecializationName = &name
		}
		c.JSON(http.StatusOK, u)
	})

	/* -- Запуск сервера -- */
	port := ":8080"
	log.Printf("Users service запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска Users service: %v", err)
	}
}
