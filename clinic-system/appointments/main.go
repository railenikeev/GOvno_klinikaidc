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
	DoctorID    int    `json:"doctor_id"`
	PatientID   int    `json:"patient_id"`
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

	// GET /my — записи текущего доктора
	r.GET("/my", func(c *gin.Context) {
		userID := c.GetHeader("X-User-ID")
		doctorID, err := strconv.Atoi(userID)
		if err != nil || doctorID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "некорректный X-User-ID"})
			return
		}

		rows, err := db.Query(
			`SELECT a.id, a.patient_id, u.full_name, a.date, a.time, a.status
			 FROM appointments a
			 JOIN users u ON a.patient_id = u.id
			 WHERE a.doctor_id = $1
			 ORDER BY a.date, a.time`,
			doctorID,
		)
		if err != nil {
			log.Println("db select error:", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось загрузить записи"})
			return
		}
		defer rows.Close()

		var apps []Appointment
		for rows.Next() {
			var a Appointment
			a.DoctorID = doctorID
			if err := rows.Scan(&a.ID, &a.PatientID, &a.PatientName, &a.Date, &a.Time, &a.Status); err == nil {
				apps = append(apps, a)
			}
		}
		c.JSON(http.StatusOK, apps)
	})

	// PATCH /:id/status — обновить статус
	r.PATCH("/:id/status", func(c *gin.Context) {
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный ID записи"})
			return
		}
		var body struct {
			Status string `json:"status"`
		}
		if err := c.BindJSON(&body); err != nil || body.Status == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный статус"})
			return
		}

		res, err := db.Exec(
			`UPDATE appointments SET status=$1 WHERE id=$2`,
			body.Status, id,
		)
		if err != nil {
			log.Println("db update error:", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось обновить статус"})
			return
		}
		if cnt, _ := res.RowsAffected(); cnt == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "запись не найдена"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"id": id, "status": body.Status})
	})

	if err := r.Run(":8083"); err != nil {
		log.Fatalf("Ошибка запуска appointments-сервиса: %v", err)
	}
}
