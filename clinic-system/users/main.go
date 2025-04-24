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
	ID       int    `json:"id"`
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Role     string `json:"role"`
	ClinicID *int   `json:"clinic_id"`
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

	// Общий хендлер получения профиля
	getProfile := func(c *gin.Context) {
		uid, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var u User
		err = db.QueryRow(
			`SELECT id, full_name, email, phone, role, clinic_id FROM users WHERE id = $1`, uid,
		).Scan(&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role, &u.ClinicID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "пользователь не найден"})
			return
		}
		c.JSON(http.StatusOK, u)
	}
	r.GET("/me", getProfile)
	r.GET("/profile", getProfile)

	// === Админ-панель клиники ===
	// GET  /stats    — подсчёт пациентов и врачей для вашей clinic_id
	r.GET("/stats", func(c *gin.Context) {
		adminID, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var clinicID *int
		if err := db.QueryRow("SELECT clinic_id FROM users WHERE id=$1", adminID).Scan(&clinicID); err != nil || clinicID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "не привязаны к клинике"})
			return
		}
		var patientsCount, doctorsCount int
		db.QueryRow("SELECT COUNT(*) FROM users WHERE role='patient' AND clinic_id=$1", *clinicID).Scan(&patientsCount)
		db.QueryRow("SELECT COUNT(*) FROM users WHERE role='doctor'  AND clinic_id=$1", *clinicID).Scan(&doctorsCount)
		c.JSON(http.StatusOK, gin.H{
			"patients":     patientsCount,
			"doctors":      doctorsCount,
			"appointments": 0,
			"payments":     0,
		})
	})

	// GET /patients  — список пациентов вашей клиники
	r.GET("/patients", func(c *gin.Context) {
		adminID, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var clinicID *int
		db.QueryRow("SELECT clinic_id FROM users WHERE id=$1", adminID).Scan(&clinicID)
		if clinicID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "не привязаны к клинике"})
			return
		}
		rows, _ := db.Query(
			"SELECT id, full_name, email FROM users WHERE role='patient' AND clinic_id=$1",
			*clinicID,
		)
		defer func(rows *sql.Rows) {
			err := rows.Close()
			if err != nil {

			}
		}(rows)
		type P struct {
			ID       int    `json:"id"`
			FullName string `json:"full_name"`
			Email    string `json:"email"`
		}
		var list []P
		for rows.Next() {
			var p P
			err := rows.Scan(&p.ID, &p.FullName, &p.Email)
			if err != nil {
				return
			}
			list = append(list, p)
		}
		c.JSON(http.StatusOK, list)
	})

	// GET /doctors  — список врачей вашей клиники
	r.GET("/doctors", func(c *gin.Context) {
		adminID, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var clinicID *int
		db.QueryRow("SELECT clinic_id FROM users WHERE id=$1", adminID).Scan(&clinicID)
		if clinicID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "не привязаны к клинике"})
			return
		}
		rows, _ := db.Query(
			"SELECT id, full_name, specialization FROM users WHERE role='doctor' AND clinic_id=$1",
			*clinicID,
		)
		defer func(rows *sql.Rows) {
			err := rows.Close()
			if err != nil {

			}
		}(rows)
		type D struct {
			ID             int    `json:"id"`
			FullName       string `json:"full_name"`
			Specialization string `json:"specialization"`
		}
		var list []D
		for rows.Next() {
			var d D
			err := rows.Scan(&d.ID, &d.FullName, &d.Specialization)
			if err != nil {
				return
			}
			list = append(list, d)
		}
		c.JSON(http.StatusOK, list)
	})

	// Старт
	if err := r.Run(":8080"); err != nil {
		log.Fatal("Ошибка запуска сервера:", err)
	}
}
