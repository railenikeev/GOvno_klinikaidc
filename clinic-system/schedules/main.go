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

	// ─── Получить все слоты для текущего врача ───
	r.GET("/schedules/my", func(c *gin.Context) {
		uid := c.GetHeader("X-User-ID")
		docID, err := strconv.Atoi(uid)
		if err != nil || docID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
			return
		}

		rows, err := db.Query(
			`SELECT id, doctor_id, start_time, end_time, is_available
			 FROM schedule_slots
			 WHERE doctor_id = $1
			 ORDER BY start_time`,
			docID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db select error: " + err.Error()})
			return
		}
		defer rows.Close()

		var slots []Slot
		for rows.Next() {
			var s Slot
			if err := rows.Scan(&s.ID, &s.DoctorID, &s.StartTime, &s.EndTime, &s.IsAvailable); err == nil {
				slots = append(slots, s)
			}
		}
		c.JSON(http.StatusOK, slots)
	})

	// ─── Создать новый слот ───
	r.POST("/schedules", func(c *gin.Context) {
		uid := c.GetHeader("X-User-ID")
		docID, err := strconv.Atoi(uid)
		if err != nil || docID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
			return
		}

		var payload struct {
			StartTime string `json:"start_time"`
			EndTime   string `json:"end_time"`
		}
		if err := c.BindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}

		start, err := time.Parse(time.RFC3339, payload.StartTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start_time"})
			return
		}
		end, err := time.Parse(time.RFC3339, payload.EndTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end_time"})
			return
		}

		var id int
		err = db.QueryRow(
			`INSERT INTO schedule_slots (doctor_id, start_time, end_time, is_available)
			 VALUES ($1, $2, $3, true) RETURNING id`,
			docID, start, end,
		).Scan(&id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db insert error: " + err.Error()})
			return
		}

		c.JSON(http.StatusCreated, Slot{
			ID:          id,
			DoctorID:    docID,
			StartTime:   start,
			EndTime:     end,
			IsAvailable: true,
		})
	})

	// ─── Обновить слот по ID ───
	r.PATCH("/schedules/:id", func(c *gin.Context) {
		uid := c.GetHeader("X-User-ID")
		docID, err := strconv.Atoi(uid)
		if err != nil || docID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
			return
		}

		slotID, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный ID слота"})
			return
		}

		var payload struct {
			StartTime string `json:"start_time"`
			EndTime   string `json:"end_time"`
		}
		if err := c.BindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}

		start, err := time.Parse(time.RFC3339, payload.StartTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start_time"})
			return
		}
		end, err := time.Parse(time.RFC3339, payload.EndTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end_time"})
			return
		}

		res, err := db.Exec(
			`UPDATE schedule_slots
			 SET start_time = $1, end_time = $2
			 WHERE id = $3 AND doctor_id = $4`,
			start, end, slotID, docID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if rows, _ := res.RowsAffected(); rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "слот не найден или не ваш"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"id": slotID})
	})

	// ─── Удалить слот по ID ───
	r.DELETE("/schedules/:id", func(c *gin.Context) {
		uid := c.GetHeader("X-User-ID")
		docID, err := strconv.Atoi(uid)
		if err != nil || docID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
			return
		}

		slotID, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный ID слота"})
			return
		}

		res, err := db.Exec(
			`DELETE FROM schedule_slots
			 WHERE id = $1 AND doctor_id = $2`,
			slotID, docID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if rows, _ := res.RowsAffected(); rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "слот не найден или не ваш"})
			return
		}

		c.Status(http.StatusNoContent)
	})

	if err := r.Run(":8082"); err != nil {
		log.Fatalf("Ошибка запуска schedules: %v", err)
	}
}
