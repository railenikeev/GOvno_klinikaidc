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

type Doctor struct {
	ID        int    `json:"id"`
	FullName  string `json:"full_name"`
	Specialty string `json:"specialty"`
	ClinicID  int    `json:"clinic_id"`
}

type Slot struct {
	ID          int       `json:"id"`
	DoctorID    int       `json:"doctor_id"`
	StartTime   time.Time `json:"start_time"`
	EndTime     time.Time `json:"end_time"`
	IsAvailable bool      `json:"is_available"`
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

	// ─── Добавить врача ───
	r.POST("/doctors", func(c *gin.Context) {
		var d Doctor
		if err := c.BindJSON(&d); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}

		err := db.QueryRow(
			`INSERT INTO doctors (full_name, specialty, clinic_id) VALUES ($1, $2, $3) RETURNING id`,
			d.FullName, d.Specialty, d.ClinicID,
		).Scan(&d.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при добавлении"})
			return
		}

		c.JSON(http.StatusCreated, d)
	})

	// ─── Получить всех врачей ───
	r.GET("/doctors", func(c *gin.Context) {
		rows, err := db.Query(`SELECT id, full_name, specialty, clinic_id FROM doctors`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка выборки"})
			return
		}
		defer rows.Close()

		var doctors []Doctor
		for rows.Next() {
			var d Doctor
			if err := rows.Scan(&d.ID, &d.FullName, &d.Specialty, &d.ClinicID); err == nil {
				doctors = append(doctors, d)
			}
		}

		c.JSON(http.StatusOK, doctors)
	})

	// ─── Добавить слот врачу ───
	r.POST("/doctors/:id/slots", func(c *gin.Context) {
		doctorID, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный ID"})
			return
		}

		var s Slot
		if err := c.BindJSON(&s); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}

		err = db.QueryRow(
			`INSERT INTO schedule_slots (doctor_id, start_time, end_time, is_available)
			 VALUES ($1, $2, $3, $4) RETURNING id`,
			doctorID, s.StartTime, s.EndTime, true,
		).Scan(&s.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при добавлении слота"})
			return
		}

		s.DoctorID = doctorID
		s.IsAvailable = true
		c.JSON(http.StatusCreated, s)
	})

	// ─── Получить слоты по врачу ───
	r.GET("/doctors/:id/slots", func(c *gin.Context) {
		doctorID, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный ID"})
			return
		}

		rows, err := db.Query(
			`SELECT id, start_time, end_time, is_available
			 FROM schedule_slots WHERE doctor_id = $1`,
			doctorID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка выборки слотов"})
			return
		}
		defer rows.Close()

		var slots []Slot
		for rows.Next() {
			var s Slot
			s.DoctorID = doctorID
			if err := rows.Scan(&s.ID, &s.StartTime, &s.EndTime, &s.IsAvailable); err == nil {
				slots = append(slots, s)
			}
		}

		c.JSON(http.StatusOK, slots)
	})

	if err := r.Run(":8082"); err != nil {
		log.Fatalf("Ошибка запуска сервера: %v", err)
	}
}
