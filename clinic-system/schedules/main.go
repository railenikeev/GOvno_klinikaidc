package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv" // Добавьте strconv
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

// --- Структура для получения данных из запроса (frontend присылает строки) ---
type CreateSlotRequest struct {
	Date      string `json:"date" binding:"required"`       // "YYYY-MM-DD"
	StartTime string `json:"start_time" binding:"required"` // "HH:MM"
	EndTime   string `json:"end_time" binding:"required"`   // "HH:MM"
}

// --- Структура для модели данных в Go и ответа фронтенду ---
type ScheduleSlotModel struct {
	ID          int    `json:"id"`
	DoctorID    int    `json:"doctor_id"`
	Date        string `json:"date"`       // Для ответа фронтенду, удобно строка YYYY-MM-DD
	StartTime   string `json:"start_time"` // Для ответа фронтенду, удобно строка HH:MM
	EndTime     string `json:"end_time"`   // Для ответа фронтенду, удобно строка HH:MM
	IsAvailable bool   `json:"is_available"`
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

	err = db.Ping()
	if err != nil {
		log.Fatalf("Ошибка пинга БД: %v", err)
	}
	log.Println("Успешное подключение к БД!")

	r := gin.Default()

	// --- Удаляем AuthMiddleware здесь! ---
	// r.Use(AuthMiddleware())

	// --- Группа маршрутов, специфичных для Schedules Service ---
	// Теперь этот сервис ожидает, что Gateway добавит заголовки X-User-ID и X-User-Role
	schedulesRoutes := r.Group("/schedules") // <- Группа /schedules
	{
		// Маршрут для добавления нового слота расписания
		// POST /schedules (доступен через Gateway как POST /api/schedules)
		schedulesRoutes.POST("", CreateScheduleSlotHandler(db))

		// Маршрут для получения слотов текущего доктора
		// GET /schedules/my (доступен через Gateway как GET /api/schedules/my)
		schedulesRoutes.GET("/my", GetMyScheduleSlotsHandler(db))

		// TODO: Добавить другие маршруты /schedules/:id (PATCH, DELETE)
	}

	// Удаляем старые ненужные маршруты

	log.Println("Schedules service listening on :8082")
	if err := r.Run(":8082"); err != nil {
		log.Fatalf("Ошибка запуска Schedules service: %v", err)
	}
}

// --- Хендлер для добавления слота ---
func CreateScheduleSlotHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Получаем ID пользователя И роль из заголовков, добавленных Gateway
		userIDStr := c.GetHeader("X-User-ID")
		userRole := c.GetHeader("X-User-Role")

		if userIDStr == "" || userRole == "" {
			// Этого не должно случиться, если Gateway работает правильно и применил middleware.
			// Если все же происходит, это серьезная ошибка конфигурации или безопасности.
			log.Println("ERROR: Received request without X-User-ID or X-User-Role headers.")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Данные пользователя не получены от шлюза"})
			return
		}

		currentUserID, err := strconv.Atoi(userIDStr)
		if err != nil {
			log.Printf("ERROR: Invalid X-User-ID header format: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка обработки ID пользователя"})
			return
		}

		// 2. Авторизация: Проверяем, что пользователь является ДОКТОРОМ
		if userRole != "doctor" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Доступ запрещен. Только для врачей."})
			return
		}
		// Теперь мы знаем, что currentUserID - это ID доктора

		// 3. Парсим тело запроса (ожидаем строки date, start_time, end_time)
		var req CreateSlotRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}

		// 4. Парсинг и валидация даты/времени
		// ... (Валидация остается той же, как и раньше) ...
		date, err := time.Parse("2006-01-02", req.Date)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат даты (ожидается YYYY-MM-DD)"})
			return
		}
		startTimeParsed, err := time.Parse("15:04", req.StartTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат времени начала (ожидается HH:MM)"})
			return
		}
		endTimeParsed, err := time.Parse("15:04", req.EndTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат времени окончания (ожидается HH:MM)"})
			return
		}

		if !endTimeParsed.After(startTimeParsed) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Время окончания должно быть позже времени начала"})
			return
		}
		if date.Before(time.Now().Truncate(24 * time.Hour)) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Нельзя добавить слот на прошедшую дату"})
			return
		}

		// 5. Вставляем данные в базу
		query := `INSERT INTO doctor_schedules (doctor_id, date, start_time, end_time, is_available)
                  VALUES ($1, $2, $3, $4, $5) RETURNING id`

		var slotID int
		err = db.QueryRow(query,
			currentUserID, // Используем ID доктора из заголовков
			date,
			req.StartTime,
			req.EndTime,
			true,
		).Scan(&slotID)

		if err != nil {
			log.Printf("Ошибка БД при добавлении слота: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при добавлении слота в базу данных"})
			return
		}

		// 6. Успешный ответ
		c.JSON(http.StatusCreated, ScheduleSlotModel{
			ID:          slotID,
			DoctorID:    currentUserID,
			Date:        req.Date,
			StartTime:   req.StartTime,
			EndTime:     req.EndTime,
			IsAvailable: true,
		})
	}
}

// --- Хендлер для получения слотов текущего доктора ---
func GetMyScheduleSlotsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Получаем ID пользователя И роль из заголовков, добавленных Gateway
		userIDStr := c.GetHeader("X-User-ID")
		userRole := c.GetHeader("X-User-Role")

		if userIDStr == "" || userRole == "" {
			log.Println("ERROR: Received request without X-User-ID or X-User-Role headers for GET /my.")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Данные пользователя не получены от шлюза"})
			return
		}

		currentUserID, err := strconv.Atoi(userIDStr)
		if err != nil {
			log.Printf("ERROR: Invalid X-User-ID header format for GET /my: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка обработки ID пользователя"})
			return
		}

		// 2. Авторизация: Проверяем, что пользователь является ДОКТОРОМ
		if userRole != "doctor" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Доступ запрещен. Только для врачей."})
			return
		}
		// Теперь мы знаем, что currentUserID - это ID доктора

		// 3. Запрос к базе данных - выбираем слоты ПО ID ДОКТОРА из заголовка
		rows, err := db.Query(
			`SELECT id, date, start_time, end_time, is_available FROM doctor_schedules WHERE doctor_id = $1 ORDER BY date, start_time`,
			currentUserID, // Используем ID доктора из заголовка
		)
		if err != nil {
			log.Printf("Ошибка БД при выборке слотов для доктора %d: %v", currentUserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении слотов из базы данных"})
			return
		}
		defer rows.Close()

		var slots []ScheduleSlotModel
		for rows.Next() {
			var s ScheduleSlotModel
			var dbDate time.Time
			var dbStartTime string // Сканируем время как строку
			var dbEndTime string   // Сканируем время как строку

			err := rows.Scan(&s.ID, &dbDate, &dbStartTime, &dbEndTime, &s.IsAvailable)
			if err != nil {
				log.Printf("Ошибка сканирования строки слота для доктора %d: %v", currentUserID, err)
				continue
			}

			s.DoctorID = currentUserID

			s.Date = dbDate.Format("2006-01-02")
			s.StartTime = dbStartTime
			s.EndTime = dbEndTime

			slots = append(slots, s)
		}

		if err = rows.Err(); err != nil {
			log.Printf("Ошибка после чтения строк слотов для доктора %d: %v", currentUserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при обработке результатов из базы"})
			return
		}

		// 4. Успешный ответ
		c.JSON(http.StatusOK, slots)
	}
}
