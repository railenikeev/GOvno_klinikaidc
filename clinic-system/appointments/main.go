package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

type Appointment struct {
	ID          int    `json:"id"`
	PatientName string `json:"patient_name"`
	Date        string `json:"date"`
	Time        string `json:"time"`
	Status      string `json:"status"`
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

	// GET /appointments/my
	r.GET("/appointments/my", func(c *gin.Context) {
		h := c.GetHeader("X-User-ID")
		if h == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
			return
		}
		doctorID, err := strconv.Atoi(h)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный X-User-ID"})
			return
		}

		rows, err := db.Query(`
			SELECT a.id, u.full_name, a.date, a.time, a.status
			FROM appointments a
			JOIN users u ON a.patient_id = u.id
			WHERE a.doctor_id = $1
			ORDER BY a.date, a.time
		`, doctorID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка выборки"})
			return
		}
		defer rows.Close()

		var appts []Appointment
		for rows.Next() {
			var a Appointment
			if err := rows.Scan(&a.ID, &a.PatientName, &a.Date, &a.Time, &a.Status); err == nil {
				appts = append(appts, a)
			}
		}
		c.JSON(http.StatusOK, appts)
	})

	// PATCH /appointments/:id/status
	r.PATCH("/appointments/:id/status", func(c *gin.Context) {
		idParam := c.Param("id")
		apptID, err := strconv.Atoi(idParam)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный ID записи"})
			return
		}
		var in struct {
			Status string `json:"status"`
		}
		if err := c.BindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}
		_, err = db.Exec(`UPDATE appointments SET status=$1 WHERE id=$2`, in.Status, apptID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка обновления статуса"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"id": apptID, "status": in.Status})
	})

	if err := r.Run(":8083"); err != nil {
		log.Fatalf("Ошибка запуска appointments_service: %v", err)
	}
}
