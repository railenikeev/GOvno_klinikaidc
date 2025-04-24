// clinic-system/schedules/main.go
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

	// === Создать слот ===
	r.POST("/", func(c *gin.Context) {
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
		var in struct {
			Date      string `json:"date"`
			StartTime string `json:"start_time"`
			EndTime   string `json:"end_time"`
		}
		if err := c.BindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
			return
		}
		start, err := time.Parse("2006-01-02 15:04", in.Date+" "+in.StartTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный формат start_time"})
			return
		}
		end, err := time.Parse("2006-01-02 15:04", in.Date+" "+in.EndTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный формат end_time"})
			return
		}
		var slotID int
		if err := db.QueryRow(
			`INSERT INTO schedule_slots (doctor_id, start_time, end_time, is_available)
			 VALUES ($1,$2,$3,TRUE) RETURNING id`,
			doctorID, start, end,
		).Scan(&slotID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при добавлении слота"})
			return
		}
		c.JSON(http.StatusCreated, Slot{
			ID:          slotID,
			DoctorID:    doctorID,
			StartTime:   start,
			EndTime:     end,
			IsAvailable: true,
		})
	})

	// === Получить слоты текущего врача ===
	r.GET("/my", func(c *gin.Context) {
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
		rows, err := db.Query(
			`SELECT id, start_time, end_time, is_available
			 FROM schedule_slots
			 WHERE doctor_id=$1
			 ORDER BY start_time`, doctorID,
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

	// === Получить доступные времена ===
	r.GET("/available", func(c *gin.Context) {
		docID := c.Query("doctor_id")
		date := c.Query("date")
		if docID == "" || date == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нужны doctor_id и date"})
			return
		}
		did, err := strconv.Atoi(docID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный doctor_id"})
			return
		}
		rows, err := db.Query(
			`SELECT start_time
			 FROM schedule_slots
			 WHERE doctor_id=$1
			   AND DATE(start_time)= $2
			   AND is_available = TRUE
			 ORDER BY start_time`,
			did, date,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка выборки"})
			return
		}
		defer rows.Close()

		var times []string
		for rows.Next() {
			var t time.Time
			if err := rows.Scan(&t); err == nil {
				times = append(times, t.Format("15:04"))
			}
		}
		c.JSON(http.StatusOK, times)
	})

	// === Обновление и удаление слота ===
	r.PATCH("/:id", func(c *gin.Context) {
		// ... ваш код PATCH без изменений, маршрут остается "/:id"
	})
	r.DELETE("/:id", func(c *gin.Context) {
		// ... ваш код DELETE без изменений
	})

	if err := r.Run(":8082"); err != nil {
		log.Fatalf("Ошибка запуска schedules_service: %v", err)
	}
}
