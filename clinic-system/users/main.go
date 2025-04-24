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

/* ─────────── модели ─────────── */

type User struct {
	ID             int    `json:"id"`
	FullName       string `json:"full_name"`
	Email          string `json:"email"`
	Phone          string `json:"phone"`
	Role           string `json:"role"`
	ClinicID       *int   `json:"clinic_id"`
	Specialization string `json:"specialization,omitempty"`
}

/* ─────────── JWT ─────────── */

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

/* ─────────── main ─────────── */

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

	/* ─────────── auth ─────────── */

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
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный JSON"})
			return
		}
		hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		var id int
		err = db.QueryRow(
			`INSERT INTO users (full_name,email,password_hash,phone,role,clinic_id,specialization)
			 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
			req.FullName, req.Email, string(hash), req.Phone, req.Role, req.ClinicID, req.Specialization).
			Scan(&id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при регистрации"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"id": id})
	})

	r.POST("/login", func(c *gin.Context) {
		var req struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if c.BindJSON(&req) != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный JSON"})
			return
		}
		var id int
		var hash string
		err := db.QueryRow(`SELECT id,password_hash FROM users WHERE email=$1`, req.Email).Scan(&id, &hash)
		if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "неверные email или пароль"})
			return
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"user_id": id,
			"exp":     time.Now().Add(24 * time.Hour).Unix(),
		})
		tokenStr, _ := token.SignedString(jwtSecret)
		c.JSON(http.StatusOK, gin.H{"token": tokenStr})
	})

	/* ─────────── профиль ─────────── */

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

	/* -------- вспомогательные endpoints для админ-панелей -------- */

	// выборка пользователей по роли: /users?role=doctor
	r.GET("/users", func(c *gin.Context) {
		role := c.Query("role")
		rows, err := db.Query(`
			SELECT id,full_name,email,phone,role,clinic_id,specialization
			FROM users
			WHERE ($1='' OR role=$1)`, role)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "query err"})
			return
		}
		defer rows.Close()
		var list []User
		for rows.Next() {
			var u User
			if err := rows.Scan(&u.ID, &u.FullName, &u.Email, &u.Phone,
				&u.Role, &u.ClinicID, &u.Specialization); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "scan err"})
				return
			}
			list = append(list, u)
		}
		c.JSON(http.StatusOK, list)
	})

	// PATCH /users/:id/role  { "role": "clinic_admin", "clinic_id": 3 }
	r.PATCH("/users/:id/role", func(c *gin.Context) {
		uid, _ := strconv.Atoi(c.Param("id"))
		var req struct {
			Role     string `json:"role"`
			ClinicID *int   `json:"clinic_id"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "bad json"})
			return
		}
		_, err := db.Exec(`UPDATE users SET role=$1, clinic_id=$2 WHERE id=$3`,
			req.Role, req.ClinicID, uid)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "update err"})
			return
		}
		c.Status(http.StatusNoContent)
	})

	log.Fatal(r.Run(":8080"))
}
