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

type Notification struct {
	ID      int       `json:"id"`
	UserID  int       `json:"user_id"`
	Channel string    `json:"channel"`
	Message string    `json:"message"`
	SentAt  time.Time `json:"sent_at"`
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

	// Создать уведомление
	r.POST("/notify", func(c *gin.Context) {
		var n Notification
		if err := c.BindJSON(&n); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}
		n.SentAt = time.Now()

		err := db.QueryRow(`
			INSERT INTO notifications (user_id, channel, message, sent_at)
			VALUES ($1, $2, $3, $4) RETURNING id`,
			n.UserID, n.Channel, n.Message, n.SentAt).Scan(&n.ID)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при создании уведомления"})
			return
		}
		c.JSON(http.StatusCreated, n)
	})

	// Получить уведомления
	r.GET("/notify", func(c *gin.Context) {
		rows, err := db.Query(`
			SELECT id, user_id, channel, message, sent_at
			FROM notifications
			ORDER BY sent_at DESC`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при получении уведомлений"})
			return
		}
		defer rows.Close()

		var list []Notification
		for rows.Next() {
			var n Notification
			if err := rows.Scan(&n.ID, &n.UserID, &n.Channel, &n.Message, &n.SentAt); err == nil {
				list = append(list, n)
			}
		}
		c.JSON(http.StatusOK, list)
	})

	if err := r.Run(":8086"); err != nil {
		log.Fatal("Ошибка запуска notifications сервиса:", err)
	}
}
