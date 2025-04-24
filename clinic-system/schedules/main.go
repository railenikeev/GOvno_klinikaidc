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

	// List my slots (doctor = X-User-ID)
	r.GET("/schedules/my", func(c *gin.Context) {
		doctorID := c.GetHeader("X-User-ID")
		if doctorID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
			return
		}
		rows, err := db.Query(`
			SELECT id, start_time, end_time, is_available
			FROM schedule_slots
			WHERE doctor_id = $1
			ORDER BY start_time
		`, doctorID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка выборки слотов"})
			return
		}
		defer rows.Close()
		var slots []Slot
		for rows.Next() {
			var s Slot
			s.DoctorID, _ = strconv.Atoi(doctorID)
			if err := rows.Scan(&s.ID, &s.StartTime, &s.EndTime, &s.IsAvailable); err == nil {
				slots = append(slots, s)
			}
		}
		c.JSON(http.StatusOK, slots)
	})

	// Create a slot for current doctor
	r.POST("/schedules", func(c *gin.Context) {
		doctorID := c.GetHeader("X-User-ID")
		if doctorID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
			return
		}

		var payload struct {
			Date      string `json:"date"`       // YYYY-MM-DD
			StartTime string `json:"start_time"` // HH:MM
			EndTime   string `json:"end_time"`   // HH:MM
		}
		if err := c.BindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}

		// parse and combine date + times
		start, err1 := time.Parse("2006-01-02 15:04", payload.Date+" "+payload.StartTime)
		end, err2 := time.Parse("2006-01-02 15:04", payload.Date+" "+payload.EndTime)
		if err1 != nil || err2 != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "некорректный формат даты/времени"})
			return
		}

		var s Slot
		err := db.QueryRow(`
			INSERT INTO schedule_slots (doctor_id, start_time, end_time, is_available)
			VALUES ($1, $2, $3, true)
			RETURNING id, start_time, end_time, is_available
		`, doctorID, start, end).Scan(&s.ID, &s.StartTime, &s.EndTime, &s.IsAvailable)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при добавлении слота"})
			return
		}
		s.DoctorID, _ = strconv.Atoi(doctorID)
		c.JSON(http.StatusCreated, s)
	})

	// (Optionally: implement PATCH/DELETE for slots here)

	if err := r.Run(":8082"); err != nil {
		log.Fatalf("Ошибка запуска сервера: %v", err)
	}
}
