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

type Payment struct {
	ID            int       `json:"id"`
	AppointmentID int       `json:"appointment_id"`
	Amount        float64   `json:"amount"`
	PaymentDate   time.Time `json:"payment_date"`
	PaymentStatus string    `json:"payment_status"`
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

	r.POST("/payments", func(c *gin.Context) {
		var p Payment
		if err := c.BindJSON(&p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}
		p.PaymentDate = time.Now()
		p.PaymentStatus = "paid"

		err := db.QueryRow(`
			INSERT INTO payments (appointment_id, amount, payment_date, payment_status)
			VALUES ($1, $2, $3, $4)
			RETURNING id`,
			p.AppointmentID, p.Amount, p.PaymentDate, p.PaymentStatus,
		).Scan(&p.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при создании платежа"})
			return
		}
		c.JSON(http.StatusCreated, p)
	})

	r.GET("/payments", func(c *gin.Context) {
		// Если пациент хочет увидеть свои оплаты, можно привязать appointment->user_id,
		// но упрощённо выведем все платежи
		rows, err := db.Query(`SELECT id, appointment_id, amount, payment_date, payment_status FROM payments`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при получении данных"})
			return
		}
		defer rows.Close()

		var list []Payment
		for rows.Next() {
			var p Payment
			if err := rows.Scan(&p.ID, &p.AppointmentID, &p.Amount, &p.PaymentDate, &p.PaymentStatus); err == nil {
				list = append(list, p)
			}
		}
		c.JSON(http.StatusOK, list)
	})

	if err := r.Run(":8085"); err != nil {
		log.Fatal("Ошибка запуска payments сервиса:", err)
	}
}
