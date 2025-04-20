package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

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

func main() {
	// Подготовка подключения к БД
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

	// 1) Регистрация
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
			 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
			req.FullName, req.Email, string(hash), req.Phone, req.Role, req.ClinicID,
		).Scan(&id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при регистрации"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"id": id})
	})

	// 2) Логин — возвращаем JWT
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

	// Общая функция получения профиля по X-User-ID
	getProfileHandler := func(c *gin.Context) {
		userID := c.GetHeader("X-User-ID")
		if userID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "не указан X-User-ID"})
			return
		}
		uid, err := strconv.Atoi(userID)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "некорректный X-User-ID"})
			return
		}
		var u User
		err = db.QueryRow(
			`SELECT id, full_name, email, phone, role, clinic_id FROM users WHERE id = $1`,
			uid,
		).Scan(&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role, &u.ClinicID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "пользователь не найден"})
			return
		}
		c.JSON(http.StatusOK, u)
	}

	// 3) Профиль — оба пути на тот же handler
	r.GET("/me", getProfileHandler)
	r.GET("/profile", getProfileHandler)

	// Запуск сервера на 8080
	if err := r.Run(":8080"); err != nil {
		log.Fatal("Ошибка запуска сервера:", err)
	}
}
