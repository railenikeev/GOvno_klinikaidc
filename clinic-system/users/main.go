// users/main.go
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

/* ---------- модели / DTO ---------- */

type User struct {
	ID             int    `json:"id"`
	FullName       string `json:"full_name"`
	Email          string `json:"email"`
	Phone          string `json:"phone"`
	Role           string `json:"role"`
	ClinicID       *int   `json:"clinic_id"`
	Specialization string `json:"specialization,omitempty"`
}

type Patient struct {
	ID       int    `json:"id"`
	FullName string `json:"full_name"`
	Email    string `json:"email"`
}

type Doctor struct {
	ID             int    `json:"id"`
	FullName       string `json:"full_name"`
	Specialization string `json:"specialization"`
}

/* ---------- jwt utils ---------- */

var jwtSecret = []byte("supersecret")

func extractUserID(c *gin.Context) (int, error) {
	auth := c.GetHeader("Authorization")
	if auth == "" {
		return 0, errors.New("отсутствует Authorization header")
	}
	parts := strings.Fields(auth)
	if len(parts) != 2 || parts[0] != "Bearer" {
		return 0, errors.New("некорректный Authorization header")
	}
	tokenStr := parts[1]

	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})
	if err != nil || !tok.Valid {
		return 0, errors.New("некорректный или просроченный токен")
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
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
		return 0, errors.New("неизвестный тип user_id")
	}
}

/* ---------- main ---------- */

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL не задан")
	}
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal("ошибка подключения к БД:", err)
	}
	defer db.Close()

	r := gin.Default()

	/* ---- регистрация ---- */
	r.POST("/register", func(c *gin.Context) {
		var req struct {
			FullName string `json:"full_name"`
			Email    string `json:"email"`
			Password string `json:"password"`
			Phone    string `json:"phone"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный JSON"})
			return
		}
		if len(req.Phone) != 11 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "телефон должен содержать 11 цифр"})
			return
		}
		hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)

		var id int
		err = db.QueryRow(`
			INSERT INTO users (full_name,email,password_hash,phone,role)
			VALUES ($1,$2,$3,$4,'patient')
			RETURNING id`,
			req.FullName, req.Email, string(hash), req.Phone,
		).Scan(&id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при регистрации"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"id": id})
	})

	/* ---- логин ---- */
	r.POST("/login", func(c *gin.Context) {
		var req struct{ Email, Password string }
		if c.BindJSON(&req) != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный JSON"})
			return
		}
		var id int
		var hash string
		if db.QueryRow(`SELECT id,password_hash FROM users WHERE email=$1`, req.Email).Scan(&id, &hash) != nil {
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
		tokenStr, _ := token.SignedString(jwtSecret)
		c.JSON(http.StatusOK, gin.H{"token": tokenStr})
	})

	/* ---- профиль ---- */
	getProfile := func(c *gin.Context) {
		uid, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var u User
		err = db.QueryRow(`
			SELECT id,full_name,email,phone,role,clinic_id,COALESCE(specialization,'')
			FROM users WHERE id=$1`, uid).
			Scan(&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role, &u.ClinicID, &u.Specialization)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "пользователь не найден"})
			return
		}
		c.JSON(http.StatusOK, u)
	}
	r.GET("/me", getProfile)
	r.GET("/profile", getProfile)

	/* ---- кнопка «Добавить врача» ---- */
	r.POST("/doctors", func(c *gin.Context) {
		var req struct {
			UserID         int    `json:"userId"`
			Specialization string `json:"specialization"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный JSON"})
			return
		}
		adminID, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var clinicID *int
		db.QueryRow(`SELECT clinic_id FROM users WHERE id=$1`, adminID).Scan(&clinicID)
		if clinicID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "админ не привязан к клинике"})
			return
		}
		res, err := db.Exec(`
			UPDATE users
			SET clinic_id=$1,
			    role='doctor',
			    specialization=$2
			WHERE id=$3`,
			*clinicID, req.Specialization, req.UserID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка БД"})
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "пользователь не найден"})
			return
		}
		c.Status(http.StatusNoContent)
	})

	/* ---- список пациентов ---- */
	r.GET("/patients", func(c *gin.Context) {
		adminID, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var clinicID *int
		db.QueryRow("SELECT clinic_id FROM users WHERE id=$1", adminID).Scan(&clinicID)
		if clinicID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "админ не привязан к клинике"})
			return
		}
		rows, _ := db.Query(`
			SELECT id,full_name,email
			FROM users
			WHERE role='patient' AND clinic_id=$1`, *clinicID)
		defer rows.Close()

		var list []Patient
		for rows.Next() {
			var p Patient
			rows.Scan(&p.ID, &p.FullName, &p.Email)
			list = append(list, p)
		}
		c.JSON(http.StatusOK, list)
	})

	/* ---- список врачей ---- */
	r.GET("/doctors", func(c *gin.Context) {
		adminID, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var clinicID *int
		db.QueryRow("SELECT clinic_id FROM users WHERE id=$1", adminID).Scan(&clinicID)
		if clinicID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "админ не привязан к клинике"})
			return
		}
		rows, _ := db.Query(`
			SELECT id,full_name,COALESCE(specialization,'')
			FROM users
			WHERE role='doctor' AND clinic_id=$1`, *clinicID)
		defer rows.Close()

		var list []Doctor
		for rows.Next() {
			var d Doctor
			rows.Scan(&d.ID, &d.FullName, &d.Specialization)
			list = append(list, d)
		}
		c.JSON(http.StatusOK, list)
	})

	/* ---- статистика ---- */
	r.GET("/stats", func(c *gin.Context) {
		adminID, err := extractUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var clinicID *int
		db.QueryRow("SELECT clinic_id FROM users WHERE id=$1", adminID).Scan(&clinicID)
		if clinicID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "админ не привязан к клинике"})
			return
		}
		var patients, doctors int
		db.QueryRow(`SELECT COUNT(*) FROM users WHERE role='patient' AND clinic_id=$1`, *clinicID).Scan(&patients)
		db.QueryRow(`SELECT COUNT(*) FROM users WHERE role='doctor'  AND clinic_id=$1`, *clinicID).Scan(&doctors)
		c.JSON(http.StatusOK, gin.H{
			"patients":     patients,
			"doctors":      doctors,
			"appointments": 0,
			"payments":     0,
		})
	})

	/* ---- run ---- */
	if err := r.Run(":8080"); err != nil {
		log.Fatal("ошибка запуска сервера:", err)
	}
}
