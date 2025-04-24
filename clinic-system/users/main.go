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

/* ──────────────── модели ──────────────── */

type User struct {
	ID             int     `json:"id"`
	FullName       string  `json:"full_name"`
	Email          string  `json:"email"`
	Phone          string  `json:"phone"`
	Role           string  `json:"role"`
	ClinicID       *int    `json:"clinic_id"`
	Specialization *string `json:"specialization,omitempty"`
}

/* ──────────────── JWT ──────────────── */

var jwtSecret = []byte("supersecret")

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
		return strconv.Atoi(v)
	default:
		return 0, errors.New("неизвестный тип user_id в токене")
	}
}

/* ──────────────── main ──────────────── */

func main() {
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

	/* ---------- регистрация ---------- */
	r.POST("/register", func(c *gin.Context) {
		var req struct {
			FullName  string `json:"full_name"`
			Email     string `json:"email"`
			Password  string `json:"password"`
			Phone     string `json:"phone"`
			Role      string `json:"role"`
			ClinicID  *int   `json:"clinic_id"`
			Specialty string `json:"specialization"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}
		hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		var id int
		err := db.QueryRow(
			`INSERT INTO users (full_name, email, password_hash, phone, role, clinic_id)
				 VALUES ($1,$2,$3,$4,$5,$6)
				 RETURNING id`,
			req.FullName, req.Email, string(hash), req.Phone, req.Role, req.ClinicID,
		).Scan(&id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при регистрации"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"id": id})
	})

	/* ---------- вход ---------- */
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
			`SELECT id, password_hash FROM users WHERE email = $1`,
			req.Email,
		).Scan(&id, &hash)
		if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "неверные учётные данные"})
			return
		}
		// создаём JWT с полем user_id
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"user_id": id,
			"exp":     time.Now().Add(24 * time.Hour).Unix(),
		})
		tokenStr, _ := tok.SignedString(jwtSecret)
		// возвращаем и токен, и ID пользователя
		c.JSON(http.StatusOK, gin.H{
			"token":   tokenStr,
			"user_id": id,
		})
	})

	/* ---------- профиль ---------- */
	getProfile := func(c *gin.Context) {
		uid, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var u User
		err = db.QueryRow(
			`SELECT id, full_name, email, phone, role, clinic_id, specialization
				 FROM users WHERE id = $1`,
			uid,
		).Scan(&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role, &u.ClinicID, &u.Specialization)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "пользователь не найден"})
			return
		}
		c.JSON(http.StatusOK, u)
	}
	r.GET("/me", getProfile)
	r.GET("/profile", getProfile)

	/* -- остальные эндпоинты (пациенты, врачи, админ и т.д.) без изменений -- */

	if err := r.Run(":8080"); err != nil {
		log.Fatal("Ошибка запуска users_service:", err)
	}
}
