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

	// ─── Создать новую запись (пациент) ───
	r.POST("/appointments", func(c *gin.Context) {
		uid := c.GetHeader("X-User-ID")
		patientID, err := strconv.Atoi(uid)
		if err != nil || patientID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
			return
		}

		var payload struct {
			DoctorID int    `json:"doctor_id"`
			Date     string `json:"date"`
			Time     string `json:"time"`
		}
		if err := c.BindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}

		var newID int
		err = db.QueryRow(
			`INSERT INTO appointments (doctor_id, patient_id, date, time, status)
			 VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
			payload.DoctorID, patientID, payload.Date, payload.Time,
		).Scan(&newID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"id": newID})
	})

	// ─── Список записей для текущего врача ───
	r.GET("/appointments/my", func(c *gin.Context) {
		uid := c.GetHeader("X-User-ID")
		doctorID, err := strconv.Atoi(uid)
		if err != nil || doctorID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
			return
		}

		rows, err := db.Query(
			`SELECT a.id, u.full_name, a.date::text, a.time::text, a.status
			   FROM appointments a
			   JOIN users u ON a.patient_id = u.id
			  WHERE a.doctor_id = $1
			  ORDER BY a.date, a.time`,
			doctorID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		var apps []Appointment
		for rows.Next() {
			var a Appointment
			if err := rows.Scan(&a.ID, &a.PatientName, &a.Date, &a.Time, &a.Status); err == nil {
				apps = append(apps, a)
			}
		}
		c.JSON(http.StatusOK, apps)
	})

	// ─── Обновить статус записи (врач) ───
	r.PATCH("/appointments/:id/status", func(c *gin.Context) {
		uid := c.GetHeader("X-User-ID")
		doctorID, err := strconv.Atoi(uid)
		if err != nil || doctorID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
			return
		}

		appID, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный ID записи"})
			return
		}

		var payload struct {
			Status string `json:"status"`
		}
		if err := c.BindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}

		res, err := db.Exec(
			`UPDATE appointments
			   SET status = $1
			 WHERE id = $2 AND doctor_id = $3`,
			payload.Status, appID, doctorID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if cnt, _ := res.RowsAffected(); cnt == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "запись не найдена или не принадлежит вам"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"id": appID, "status": payload.Status})
	})

	if err := r.Run(":8083"); err != nil {
		log.Fatalf("Ошибка запуска appointments: %v", err)
	}
}
