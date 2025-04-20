package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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
	ID             int    `json:"id"`
	FullName       string `json:"full_name"`
	Email          string `json:"email"`
	Phone          string `json:"phone"`
	Role           string `json:"role"`
	ClinicID       *int   `json:"clinic_id"`
	Specialization string `json:"specialization"`
}

// Простая структура для подсчёта элементов из других сервисов
type countResp struct {
	Count int `json:"count"`
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

// helper делает GET-запрос к заданному URL и возвращает поле "count" из JSON-ответа
func fetchCount(url string) int {
	resp, err := http.Get(url)
	if err != nil {
		return 0
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0
	}
	var cr countResp
	body, _ := io.ReadAll(resp.Body)
	json.Unmarshal(body, &cr)
	return cr.Count
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
			FullName       string `json:"full_name"`
			Email          string `json:"email"`
			Password       string `json:"password"`
			Phone          string `json:"phone"`
			Role           string `json:"role"`
			ClinicID       *int   `json:"clinic_id"`
			Specialization string `json:"specialization"`
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
			`INSERT INTO users (full_name, email, password_hash, phone, role, clinic_id, specialization)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
			req.FullName, req.Email, string(hash), req.Phone, req.Role, req.ClinicID, req.Specialization,
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

	// Реальная логика для /admin/stats
	r.GET("/admin/stats", func(c *gin.Context) {
		uid, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		// Узнаём clinic_id админа
		var clinicID sql.NullInt64
		if err := db.QueryRow(
			`SELECT clinic_id FROM users WHERE id = $1`, uid,
		).Scan(&clinicID); err != nil || !clinicID.Valid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "не задана клиника для этого пользователя"})
			return
		}

		// Считаем пациентов и врачей
		var patients, doctors int
		db.QueryRow(
			`SELECT COUNT(*) FROM users WHERE role = 'patient' AND clinic_id = $1`,
			clinicID.Int64,
		).Scan(&patients)
		db.QueryRow(
			`SELECT COUNT(*) FROM users WHERE role = 'doctor' AND clinic_id = $1`,
			clinicID.Int64,
		).Scan(&doctors)

		// Считаем записи и платежи, вызывая другие сервисы по HTTP
		apptsURL := fmt.Sprintf("http://appointments:8083/appointments/count?clinic_id=%d", clinicID.Int64)
		paysURL := fmt.Sprintf("http://payments:8085/payments/count?clinic_id=%d", clinicID.Int64)

		appointments := fetchCount(apptsURL)
		payments := fetchCount(paysURL)

		c.JSON(http.StatusOK, gin.H{
			"patients":     patients,
			"doctors":      doctors,
			"appointments": appointments,
			"payments":     payments,
		})
	})

	// Старт
	if err := r.Run(":8080"); err != nil {
		log.Fatal("Ошибка запуска сервера:", err)
	}
}
