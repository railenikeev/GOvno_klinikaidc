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
	PatientID   int    `json:"patient_id"`
	PatientName string `json:"patient_name,omitempty"` // опционально, если хотите JOIN с users
	DoctorID    int    `json:"doctor_id"`
	Date        string `json:"date"`
	Time        string `json:"time"`
	Status      string `json:"status"`
}

func main() {
	// читаем коннект из env
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

	// === Создать запись (пациент) ===
	r.POST("/appointments", func(c *gin.Context) {
		patientHeader := c.GetHeader("X-User-ID")
		if patientHeader == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
			return
		}
		patientID, err := strconv.Atoi(patientHeader)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный X-User-ID"})
			return
		}

		var in struct {
			DoctorID int    `json:"doctor_id"`
			Date     string `json:"date"`
			Time     string `json:"time"`
		}
		if err := c.BindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}

		var apptID int
		err = db.QueryRow(
			`INSERT INTO appointments (patient_id, doctor_id, date, time, status)
			 VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
			patientID, in.DoctorID, in.Date, in.Time,
		).Scan(&apptID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка создания записи"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"id": apptID})
	})

	// === Список записей текущего врача ===
	r.GET("/appointments/my", func(c *gin.Context) {
		doctorHeader := c.GetHeader("X-User-ID")
		if doctorHeader == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
			return
		}
		doctorID, err := strconv.Atoi(doctorHeader)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный X-User-ID"})
			return
		}

		rows, err := db.Query(
			`SELECT id, patient_id, doctor_id, date, time, status
			 FROM appointments WHERE doctor_id = $1
			 ORDER BY date, time`,
			doctorID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка выборки"})
			return
		}
		defer rows.Close()

		var apps []Appointment
		for rows.Next() {
			var a Appointment
			if err := rows.Scan(&a.ID, &a.PatientID, &a.DoctorID, &a.Date, &a.Time, &a.Status); err != nil {
				continue
			}
			apps = append(apps, a)
		}

		c.JSON(http.StatusOK, apps)
	})

	// === Обновить статус записи ===
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

		res, err := db.Exec(
			`UPDATE appointments SET status = $1 WHERE id = $2`,
			in.Status, apptID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка обновления статуса"})
			return
		}
		if cnt, _ := res.RowsAffected(); cnt == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "запись не найдена"})
			return
		}

		c.Status(http.StatusNoContent)
	})

	if err := r.Run(":8083"); err != nil {
		log.Fatalf("Ошибка запуска appointments_service: %v", err)
	}
}
