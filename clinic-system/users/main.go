package main

import (
	"database/sql"
	"errors"
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

// User — структура ответа профиля
type User struct {
	ID             int     `json:"id"`
	FullName       string  `json:"full_name"`
	Email          string  `json:"email"`
	Phone          string  `json:"phone"`
	Role           string  `json:"role"`
	ClinicID       *int    `json:"clinic_id"`
	Specialization *string `json:"specialization,omitempty"`
}

// Секрет для подписи JWT (лучше хранить в ENV)
var jwtSecret = []byte("supersecret")

// extractUserID достаёт user_id из JWT в Authorization: Bearer <token>
func extractUserID(c *gin.Context) (int, error) {
	auth := c.GetHeader("Authorization")
	if auth == "" {
		return 0, errors.New("отсутствует Authorization Header")
	}
	parts := strings.Fields(auth)
	if len(parts) != 2 || parts[0] != "Bearer" {
		return 0, errors.New("некорректный Authorization Header")
	}
	tokenStr := parts[1]

	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})
	if err != nil || !token.Valid {
		return 0, errors.New("некорректный или просроченный токен")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, errors.New("неверный формат токена")
	}
	raw, ok := claims["user_id"]
	if !ok {
		return 0, errors.New("user_id не найден в токене")
	}
	switch v := raw.(type) {
	case float64:
		return int(v), nil
	case string:
		id, err := strconv.Atoi(v)
		return id, err
	default:
		return 0, errors.New("неизвестный тип user_id в токене")
	}
}

func main() {
	// Подключение к БД
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL не задан")
	}
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal("Ошибка подключения к БД:", err)
	}
	defer db.Close()

	r := gin.Default()

	// Регистрация
	r.POST("/register", func(c *gin.Context) {
		var req struct {
			FullName string `json:"full_name"`
			Email    string `json:"email"`
			Password string `json:"password"`
			Phone    string `json:"phone"`
			Role     string `json:"role"`
			ClinicID *int   `json:"clinic_id"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка хеширования"})
			return
		}
		var id int
		err = db.QueryRow(
			`INSERT INTO users (full_name, email, password_hash, phone, role, clinic_id)
			 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
			req.FullName, req.Email, string(hash), req.Phone, req.Role, req.ClinicID,
		).Scan(&id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при регистрации"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"id": id})
	})

	// Логин — возвращаем JWT
	r.POST("/login", func(c *gin.Context) {
		var req struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}
		var id int
		var hash string
		err := db.QueryRow(
			`SELECT id, password_hash FROM users WHERE email = $1`, req.Email,
		).Scan(&id, &hash)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "пользователь не найден"})
			return
		}
		if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "неверный пароль"})
			return
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"user_id": id,
			"exp":     time.Now().Add(24 * time.Hour).Unix(),
		})
		tokenStr, err := token.SignedString(jwtSecret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка формирования токена"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"token": tokenStr})
	})

	// Хендлер получения профиля
	getProfile := func(c *gin.Context) {
		uid, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var u User
		err = db.QueryRow(
			`SELECT id, full_name, email, phone, role, clinic_id, specialization
			 FROM users WHERE id = $1`, uid,
		).Scan(&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role, &u.ClinicID, &u.Specialization)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "пользователь не найден"})
			return
		}
		c.JSON(http.StatusOK, u)
	}

	r.GET("/me", getProfile)
	r.GET("/profile", getProfile)

	// === Админские эндпоинты для клиники ===

	// GET /admin/stats — статистика по вашей клинике
	r.GET("/admin/stats", func(c *gin.Context) {
		adminID, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var clinicID *int
		if err := db.QueryRow(
			`SELECT clinic_id FROM users WHERE id = $1`, adminID,
		).Scan(&clinicID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка запроса"})
			return
		}
		if clinicID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "вы не привязаны к клинике"})
			return
		}
		var patientsCount, doctorsCount int
		db.QueryRow(
			`SELECT COUNT(*) FROM users WHERE role='patient' AND clinic_id=$1`, *clinicID,
		).Scan(&patientsCount)
		db.QueryRow(
			`SELECT COUNT(*) FROM users WHERE role='doctor' AND clinic_id=$1`, *clinicID,
		).Scan(&doctorsCount)

		c.JSON(http.StatusOK, gin.H{
			"patients":     patientsCount,
			"doctors":      doctorsCount,
			"appointments": 0, // для полной статистики данные из других сервисов
			"payments":     0,
		})
	})

	// GET /admin/patients — список пациентов вашей клиники
	r.GET("/admin/patients", func(c *gin.Context) {
		adminID, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var clinicID *int
		db.QueryRow(`SELECT clinic_id FROM users WHERE id=$1`, adminID).Scan(&clinicID)
		if clinicID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "вы не привязаны к клинике"})
			return
		}
		rows, err := db.Query(
			`SELECT id, full_name, email, phone FROM users
			 WHERE role='patient' AND clinic_id=$1`, *clinicID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка запроса"})
			return
		}
		defer rows.Close()

		type P struct {
			ID       int    `json:"id"`
			FullName string `json:"full_name"`
			Email    string `json:"email"`
			Phone    string `json:"phone"`
		}
		var list []P
		for rows.Next() {
			var p P
			rows.Scan(&p.ID, &p.FullName, &p.Email, &p.Phone)
			list = append(list, p)
		}
		c.JSON(http.StatusOK, list)
	})

	// GET /admin/doctors — список ваших врачей
	r.GET("/admin/doctors", func(c *gin.Context) {
		adminID, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var clinicID *int
		db.QueryRow(`SELECT clinic_id FROM users WHERE id=$1`, adminID).Scan(&clinicID)
		if clinicID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "вы не привязаны к клинике"})
			return
		}
		rows, err := db.Query(
			`SELECT id, full_name, email, phone, specialization FROM users
			 WHERE role='doctor' AND clinic_id=$1`, *clinicID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка запроса"})
			return
		}
		defer rows.Close()

		type D struct {
			ID             int    `json:"id"`
			FullName       string `json:"full_name"`
			Email          string `json:"email"`
			Phone          string `json:"phone"`
			Specialization string `json:"specialization"`
		}
		var list []D
		for rows.Next() {
			var d D
			rows.Scan(&d.ID, &d.FullName, &d.Email, &d.Phone, &d.Specialization)
			list = append(list, d)
		}
		c.JSON(http.StatusOK, list)
	})

	// === CRUD для /doctors ===

	// GET /doctors — все врачи вашей клиники
	r.GET("/doctors", func(c *gin.Context) {
		adminID, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var clinicID *int
		db.QueryRow(`SELECT clinic_id FROM users WHERE id=$1`, adminID).Scan(&clinicID)
		if clinicID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "вы не привязаны к клинике"})
			return
		}
		rows, err := db.Query(
			`SELECT id, full_name, email, phone, specialization FROM users
			 WHERE role='doctor' AND clinic_id=$1`, *clinicID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка запроса"})
			return
		}
		defer rows.Close()

		var list []User
		for rows.Next() {
			var u User
			rows.Scan(&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role, &u.ClinicID, &u.Specialization)
			list = append(list, u)
		}
		c.JSON(http.StatusOK, list)
	})

	// POST /doctors — добавить врача (по ID) с специализацией
	r.POST("/doctors", func(c *gin.Context) {
		var req struct {
			UserID         int    `json:"userId"`
			Specialization string `json:"specialization"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "некорректный JSON"})
			return
		}
		adminID, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var clinicID *int
		if err := db.QueryRow(`SELECT clinic_id FROM users WHERE id=$1`, adminID).Scan(&clinicID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "внутренняя ошибка"})
			return
		}
		if clinicID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "вы не привязаны к клинике"})
			return
		}
		res, err := db.Exec(
			`UPDATE users
			 SET role='doctor', clinic_id=$1, specialization=$2
			 WHERE id=$3`,
			*clinicID, req.Specialization, req.UserID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось добавить врача"})
			return
		}
		ra, _ := res.RowsAffected()
		if ra == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "пользователь не найден"})
			return
		}
		c.Status(http.StatusNoContent)
	})

	// GET /doctors/:id — инфо по врачу
	r.GET("/doctors/:id", func(c *gin.Context) {
		adminID, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var clinicID *int
		db.QueryRow(`SELECT clinic_id FROM users WHERE id=$1`, adminID).Scan(&clinicID)
		if clinicID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "вы не привязаны к клинике"})
			return
		}
		docID, _ := strconv.Atoi(c.Param("id"))
		var u User
		err = db.QueryRow(
			`SELECT id, full_name, email, phone, role, clinic_id, specialization
			 FROM users WHERE id=$1 AND role='doctor' AND clinic_id=$2`,
			docID, *clinicID,
		).Scan(&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role, &u.ClinicID, &u.Specialization)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "врач не найден"})
			return
		}
		c.JSON(http.StatusOK, u)
	})

	// PUT /doctors/:id — изменить специализацию
	r.PUT("/doctors/:id", func(c *gin.Context) {
		adminID, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var clinicID *int
		db.QueryRow(`SELECT clinic_id FROM users WHERE id=$1`, adminID).Scan(&clinicID)
		if clinicID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "вы не привязаны к клинике"})
			return
		}
		docID, _ := strconv.Atoi(c.Param("id"))
		var req struct {
			Specialization string `json:"specialization"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "некорректный JSON"})
			return
		}
		res, err := db.Exec(
			`UPDATE users SET specialization=$1 WHERE id=$2 AND role='doctor' AND clinic_id=$3`,
			req.Specialization, docID, *clinicID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось обновить"})
			return
		}
		ra, _ := res.RowsAffected()
		if ra == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "врач не найден"})
			return
		}
		c.Status(http.StatusNoContent)
	})

	// DELETE /doctors/:id — демотировать врача обратно в пациента
	r.DELETE("/doctors/:id", func(c *gin.Context) {
		adminID, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var clinicID *int
		db.QueryRow(`SELECT clinic_id FROM users WHERE id=$1`, adminID).Scan(&clinicID)
		if clinicID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "вы не привязаны к клинике"})
			return
		}
		docID, _ := strconv.Atoi(c.Param("id"))
		res, err := db.Exec(
			`UPDATE users
			 SET role='patient', specialization=NULL
			 WHERE id=$1 AND role='doctor' AND clinic_id=$2`,
			docID, *clinicID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось удалить врача"})
			return
		}
		ra, _ := res.RowsAffected()
		if ra == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "врач не найден"})
			return
		}
		c.Status(http.StatusNoContent)
	})

	// Запуск сервера
	if err := r.Run(":8080"); err != nil {
		log.Fatal("Ошибка запуска сервера:", err)
	}
}
