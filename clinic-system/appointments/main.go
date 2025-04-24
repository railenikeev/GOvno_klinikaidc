package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

type Appointment struct {
	ID        int       `json:"id"`
	UserID    int       `json:"user_id"`
	SlotID    int       `json:"slot_id"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

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

	// Create appointment
	r.POST("/appointments", func(c *gin.Context) {
		var a Appointment
		if err := c.BindJSON(&a); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}
		a.Status = "записан"
		err := db.QueryRow(`
			INSERT INTO appointments (user_id, slot_id, status)
			VALUES ($1, $2, $3)
			RETURNING id, created_at
		`, a.UserID, a.SlotID, a.Status).Scan(&a.ID, &a.CreatedAt)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при записи"})
			return
		}
		c.JSON(http.StatusCreated, a)
	})

	// List all appointments for the given X-User-ID
	handlerList := func(c *gin.Context) {
		userID := c.GetHeader("X-User-ID")
		if userID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
			return
		}
		rows, err := db.Query(`
			SELECT id, user_id, slot_id, status, created_at
			FROM appointments
			WHERE user_id = $1
		`, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при запросе"})
			return
		}
		defer rows.Close()
		var list []Appointment
		for rows.Next() {
			var a Appointment
			if err := rows.Scan(&a.ID, &a.UserID, &a.SlotID, &a.Status, &a.CreatedAt); err == nil {
				list = append(list, a)
			}
		}
		c.JSON(http.StatusOK, list)
	}
	// GET /appointments and GET /appointments/my both list for current user
	r.GET("/appointments", handlerList)
	r.GET("/appointments/my", handlerList)

	// Update status
	r.PATCH("/appointments/:id/status", func(c *gin.Context) {
		id := c.Param("id")
		var body struct {
			Status string `json:"status"`
		}
		if err := c.BindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}
		_, err := db.Exec(`UPDATE appointments SET status=$1 WHERE id=$2`, body.Status, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось обновить статус записи"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"id": id, "status": body.Status})
	})

	// Cancel (delete) appointment
	r.DELETE("/appointments/:id", func(c *gin.Context) {
		id := c.Param("id")
		_, err := db.Exec(`DELETE FROM appointments WHERE id = $1`, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось отменить запись"})
			return
		}
		c.Status(http.StatusNoContent)
	})

	if err := r.Run(":8083"); err != nil {
		log.Fatalf("Ошибка запуска сервиса: %v", err)
	}
}
