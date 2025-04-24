// clinic-system/appointments/main.go
package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

type Appointment struct {
	ID          int       `json:"id"`
	DoctorID    int       `json:"doctor_id"`
	PatientName string    `json:"patient_name"`
	Date        string    `json:"date"`
	Time        string    `json:"time"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"-"`
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

	// === Мои записи ===
	r.GET("/my", func(c *gin.Context) {
		user := c.GetHeader("X-User-ID")
		if user == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
			return
		}
		doctorID, err := strconv.Atoi(user)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный X-User-ID"})
			return
		}
		rows, err := db.Query(`
			SELECT a.id, a.doctor_id, u.full_name, a.date, a.time, a.status
			FROM appointments a
			JOIN users u ON u.id = a.patient_id
			WHERE a.doctor_id = $1
			ORDER BY a.date, a.time
		`, doctorID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка выборки"})
			return
		}
		defer rows.Close()

		var apps []Appointment
		for rows.Next() {
			var a Appointment
			if err := rows.Scan(&a.ID, &a.DoctorID, &a.PatientName, &a.Date, &a.Time, &a.Status); err == nil {
				apps = append(apps, a)
			}
		}
		c.JSON(http.StatusOK, apps)
	})

	// === Обновить статус ===
	r.PATCH("/:id/status", func(c *gin.Context) {
		user := c.GetHeader("X-User-ID")
		if user == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
			return
		}
		// valdiate doctor owns appointment...
		var in struct {
			Status string `json:"status"`
		}
		if err := c.BindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный ID"})
			return
		}
		if _, err := db.Exec(`UPDATE appointments SET status=$1 WHERE id=$2`, in.Status, id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка обновления"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	r.Run(":8083")
}
