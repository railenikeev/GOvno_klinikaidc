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

	// POST /schedules — создаём слот
	// Ожидаем тело { "doctor_id":123, "date":"2025-04-25", "start_time":"09:00", "end_time":"10:00" }
	r.POST("/schedules", func(c *gin.Context) {
		var req struct {
			DoctorID  int    `json:"doctor_id"`
			Date      string `json:"date"`
			StartTime string `json:"start_time"`
			EndTime   string `json:"end_time"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный JSON"})
			return
		}

		// Парсим дату+время
		start, err := time.Parse("2006-01-02T15:04", req.Date+"T"+req.StartTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный формат start_time"})
			return
		}
		end, err := time.Parse("2006-01-02T15:04", req.Date+"T"+req.EndTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный формат end_time"})
			return
		}

		var s Slot
		err = db.QueryRow(`
			INSERT INTO schedule_slots (doctor_id, start_time, end_time, is_available)
			VALUES ($1, $2, $3, TRUE)
			RETURNING id, doctor_id, start_time, end_time, is_available
		`, req.DoctorID, start, end).Scan(
			&s.ID, &s.DoctorID, &s.StartTime, &s.EndTime, &s.IsAvailable,
		)
		if err != nil {
			log.Println("db insert error:", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось создать слот"})
			return
		}

		c.JSON(http.StatusCreated, s)
	})

	// GET /schedules/my?doctor_id=123 — возвращаем только свои слоты
	r.GET("/schedules/my", func(c *gin.Context) {
		docID := c.Query("doctor_id")
		rows, err := db.Query(`
			SELECT id, doctor_id, start_time, end_time, is_available
			FROM schedule_slots
			WHERE doctor_id = $1
			ORDER BY start_time
		`, docID)
		if err != nil {
			log.Println("db select error:", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось загрузить слоты"})
			return
		}
		defer rows.Close()

		var slots []Slot
		for rows.Next() {
			var s Slot
			if err := rows.Scan(
				&s.ID, &s.DoctorID, &s.StartTime, &s.EndTime, &s.IsAvailable,
			); err == nil {
				slots = append(slots, s)
			}
		}
		c.JSON(http.StatusOK, slots)
	})

	// DELETE /schedules/:id
	r.DELETE("/schedules/:id", func(c *gin.Context) {
		id := c.Param("id")
		res, err := db.Exec(`DELETE FROM schedule_slots WHERE id = $1`, id)
		if err != nil {
			log.Println("db delete error:", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось удалить слот"})
			return
		}
		if cnt, _ := res.RowsAffected(); cnt == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "слот не найден"})
			return
		}
		c.Status(http.StatusNoContent)
	})

	// PATCH /schedules/:id
	r.PATCH("/schedules/:id", func(c *gin.Context) {
		id := c.Param("id")
		var req struct {
			Date      string `json:"date"`
			StartTime string `json:"start_time"`
			EndTime   string `json:"end_time"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный JSON"})
			return
		}
		start, err := time.Parse("2006-01-02T15:04", req.Date+"T"+req.StartTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный формат start_time"})
			return
		}
		end, err := time.Parse("2006-01-02T15:04", req.Date+"T"+req.EndTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный формат end_time"})
			return
		}

		var s Slot
		err = db.QueryRow(`
			UPDATE schedule_slots
			SET start_time = $1, end_time = $2
			WHERE id = $3
			RETURNING id, doctor_id, start_time, end_time, is_available
		`, start, end, id).Scan(
			&s.ID, &s.DoctorID, &s.StartTime, &s.EndTime, &s.IsAvailable,
		)
		if err != nil {
			log.Println("db update error:", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось обновить слот"})
			return
		}
		c.JSON(http.StatusOK, s)
	})

	// Запускаем на :8082
	if err := r.Run(":8082"); err != nil {
		log.Fatalf("Ошибка запуска schedules-сервиса: %v", err)
	}
}
