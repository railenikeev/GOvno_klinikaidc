package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
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

	// Группа маршрутов для работы со слотами
	slots := r.Group("/schedules")
	{
		// Создать новый слот
		slots.POST("", func(c *gin.Context) {
			h := c.GetHeader("X-User-ID")
			if h == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
				return
			}
			doctorID, err := strconv.Atoi(h)
			if err != nil || doctorID <= 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "неверный X-User-ID"})
				return
			}

			var in struct {
				Date      string `json:"date"`       // "YYYY-MM-DD"
				StartTime string `json:"start_time"` // "HH:MM"
				EndTime   string `json:"end_time"`   // "HH:MM"
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
			err = db.QueryRow(
				`INSERT INTO schedule_slots (doctor_id, start_time, end_time, is_available)
				 VALUES ($1, $2, $3, TRUE) RETURNING id`,
				doctorID, start, end,
			).Scan(&slotID)
			if err != nil {
				log.Println("db insert error:", err)
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

		// Получить все слоты текущего доктора
		slots.GET("/my", func(c *gin.Context) {
			h := c.GetHeader("X-User-ID")
			if h == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "нужен заголовок X-User-ID"})
				return
			}
			doctorID, err := strconv.Atoi(h)
			if err != nil || doctorID <= 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "неверный X-User-ID"})
				return
			}

			rows, err := db.Query(
				`SELECT id, start_time, end_time, is_available
				 FROM schedule_slots
				 WHERE doctor_id = $1
				 ORDER BY start_time`,
				doctorID,
			)
			if err != nil {
				log.Println("db select error:", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка выборки слотов"})
				return
			}
			defer rows.Close()

			var list []Slot
			for rows.Next() {
				var s Slot
				s.DoctorID = doctorID
				if err := rows.Scan(&s.ID, &s.StartTime, &s.EndTime, &s.IsAvailable); err == nil {
					list = append(list, s)
				}
			}
			c.JSON(http.StatusOK, list)
		})

		// Обновить существующий слот
		slots.PATCH("/:id", func(c *gin.Context) {
			idParam := c.Param("id")
			slotID, err := strconv.Atoi(idParam)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "неверный ID слота"})
				return
			}

			var in struct {
				Date      *string `json:"date"`
				StartTime *string `json:"start_time"`
				EndTime   *string `json:"end_time"`
			}
			if err := c.BindJSON(&in); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный запрос"})
				return
			}

			setClauses := []string{}
			args := []interface{}{}
			argIdx := 1

			if in.Date != nil && in.StartTime != nil {
				t, err := time.Parse("2006-01-02 15:04", *in.Date+" "+*in.StartTime)
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "неверный формат start_time"})
					return
				}
				setClauses = append(setClauses, `start_time = $`+strconv.Itoa(argIdx))
				args = append(args, t)
				argIdx++
			}
			if in.Date != nil && in.EndTime != nil {
				t, err := time.Parse("2006-01-02 15:04", *in.Date+" "+*in.EndTime)
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "неверный формат end_time"})
					return
				}
				setClauses = append(setClauses, `end_time = $`+strconv.Itoa(argIdx))
				args = append(args, t)
				argIdx++
			}

			if len(setClauses) == 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "нет полей для обновления"})
				return
			}

			query := `UPDATE schedule_slots SET ` +
				strings.Join(setClauses, ", ") +
				` WHERE id = $` + strconv.Itoa(argIdx)
			args = append(args, slotID)

			if _, err := db.Exec(query, args...); err != nil {
				log.Println("db update error:", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка обновления слота"})
				return
			}
			c.Status(http.StatusNoContent)
		})

		// Удалить слот
		slots.DELETE("/:id", func(c *gin.Context) {
			idParam := c.Param("id")
			slotID, err := strconv.Atoi(idParam)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "неверный ID слота"})
				return
			}
			if _, err := db.Exec(`DELETE FROM schedule_slots WHERE id = $1`, slotID); err != nil {
				log.Println("db delete error:", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка удаления слота"})
				return
			}
			c.Status(http.StatusNoContent)
		})
	}

	if err := r.Run(":8082"); err != nil {
		log.Fatalf("Ошибка запуска schedules_service: %v", err)
	}
}
