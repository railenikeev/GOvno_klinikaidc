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

type MedicalRecord struct {
	ID            int       `json:"id"`
	PatientID     int       `json:"patient_id"`
	DoctorID      int       `json:"doctor_id"`
	AppointmentID int       `json:"appointment_id"`
	Diagnosis     string    `json:"diagnosis"`
	Treatment     string    `json:"treatment"`
	VisitDate     time.Time `json:"visit_date"`
}

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL не задан")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal("Не удалось подключиться к БД:", err)
	}
	defer db.Close()

	r := gin.Default()

	// 1) Добавить запись в медицинскую карту
	r.POST("/records", func(c *gin.Context) {
		var rec MedicalRecord
		if err := c.BindJSON(&rec); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}

		err := db.QueryRow(`
			INSERT INTO medical_records (patient_id, doctor_id, appointment_id, diagnosis, treatment, visit_date)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id`,
			rec.PatientID, rec.DoctorID, rec.AppointmentID, rec.Diagnosis, rec.Treatment, rec.VisitDate).
			Scan(&rec.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при добавлении записи"})
			return
		}
		c.JSON(http.StatusCreated, rec)
	})

	// 2) Получить список записей пациента
	r.GET("/records", func(c *gin.Context) {
		// Можно брать patient_id из заголовка X-User-ID (если пациент),
		// или передавать query-параметр ?patient_id=...
		patientIDStr := c.Query("patient_id")
		if patientIDStr == "" {
			patientIDStr = c.GetHeader("X-User-ID")
		}
		if patientIDStr == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "не указан patient_id или X-User-ID"})
			return
		}

		pid, err := strconv.Atoi(patientIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный patient_id"})
			return
		}

		rows, err := db.Query(`
			SELECT id, patient_id, doctor_id, appointment_id, diagnosis, treatment, visit_date
			FROM medical_records
			WHERE patient_id = $1
			ORDER BY visit_date DESC`, pid)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при запросе БД"})
			return
		}
		defer rows.Close()

		var records []MedicalRecord
		for rows.Next() {
			var r MedicalRecord
			if err := rows.Scan(&r.ID, &r.PatientID, &r.DoctorID, &r.AppointmentID, &r.Diagnosis, &r.Treatment, &r.VisitDate); err == nil {
				records = append(records, r)
			}
		}
		c.JSON(http.StatusOK, records)
	})

	if err := r.Run(":8084"); err != nil {
		log.Fatal("Ошибка запуска medical_records сервиса:", err)
	}
}
