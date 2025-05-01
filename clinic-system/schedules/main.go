package main

import (
	"database/sql"
	_ "errors" // Добавим для sql.ErrNoRows
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time" // Убедимся, что time импортирован

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq" // Драйвер PostgreSQL
)

// --- Структура для получения данных из запроса ---
type CreateSlotRequest struct {
	Date      string `json:"date" binding:"required"`       // Формат "YYYY-MM-DD"
	StartTime string `json:"start_time" binding:"required"` // Формат "HH:MM"
	EndTime   string `json:"end_time" binding:"required"`   // Формат "HH:MM"
}

// --- Структура для модели данных и ответа ---
type ScheduleSlotModel struct {
	ID          int    `json:"id"`
	DoctorID    int    `json:"doctor_id"`
	Date        string `json:"date"`       // Формат "YYYY-MM-DD"
	StartTime   string `json:"start_time"` // Формат "HH:MM"
	EndTime     string `json:"end_time"`   // Формат "HH:MM"
	IsAvailable bool   `json:"is_available"`
}

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("Переменная окружения DATABASE_URL не задана")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Ошибка подключения к БД: %v", err)
	}
	defer db.Close()

	if err = db.Ping(); err != nil {
		log.Fatalf("Ошибка пинга БД: %v", err)
	}
	log.Println("Успешное подключение к БД (Schedules service)!")

	r := gin.Default()

	// Группа маршрутов /schedules
	// Сервис полагается на аутентификацию и заголовки от Gateway
	schedulesRoutes := r.Group("/schedules")
	{
		// POST /schedules - Добавить новый слот (только для врача)
		schedulesRoutes.POST("", CreateScheduleSlotHandler(db))

		// GET /schedules/my - Получить слоты текущего врача (только для врача)
		schedulesRoutes.GET("/my", GetMyScheduleSlotsHandler(db))

		// TODO: Можно добавить маршруты для получения слотов конкретного врача по ID (для админа?)
		// GET /schedules/doctor/:doctor_id

		// TODO: Можно добавить маршруты для обновления/удаления слотов
		// PATCH /schedules/:slot_id
		// DELETE /schedules/:slot_id
	}

	port := ":8082" // Порт по умолчанию для сервиса расписаний
	log.Printf("Schedules service запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска Schedules service: %v", err)
	}
}

// --- Хендлер для добавления слота ---
func CreateScheduleSlotHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Получаем ID и роль пользователя из заголовков
		userIDStr := c.GetHeader("X-User-ID")
		userRole := c.GetHeader("X-User-Role")

		if userIDStr == "" || userRole == "" {
			log.Println("Schedules ERROR: Заголовки X-User-ID/X-User-Role отсутствуют.")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Данные пользователя не получены от шлюза"})
			return
		}

		currentUserID, err := strconv.Atoi(userIDStr)
		if err != nil {
			log.Printf("Schedules ERROR: Неверный формат X-User-ID: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка обработки ID пользователя"})
			return
		}

		// 2. Авторизация: Только врач может добавлять слоты
		if userRole != "doctor" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Доступ запрещен. Только врачи могут добавлять слоты."})
			return
		}
		// currentUserID теперь точно ID врача

		// 3. Парсим тело запроса
		var req CreateSlotRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}

		// 4. Парсинг и валидация даты/времени
		// Используем ParseInLocation или Parse для учета часовых поясов, если это важно.
		// Для простоты используем Parse.
		dateParsed, err := time.Parse("2006-01-02", req.Date)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат даты (ожидается YYYY-MM-DD)"})
			return
		}
		// Парсим время в time.Time для корректной передачи в БД (тип TIME)
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

		// Валидация времени и даты
		if !endTimeParsed.After(startTimeParsed) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Время окончания должно быть позже времени начала"})
			return
		}
		// Сравниваем только дату, без времени
		today := time.Now().Truncate(24 * time.Hour)
		if dateParsed.Before(today) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Нельзя добавить слот на прошедшую дату"})
			return
		}

		// 5. Вставляем данные в базу
		query := `INSERT INTO doctor_schedules (doctor_id, date, start_time, end_time, is_available)
                  VALUES ($1, $2, $3, $4, $5) RETURNING id`

		var slotID int
		// Передаем распарсенные dateParsed, startTimeParsed, endTimeParsed
		err = db.QueryRow(query,
			currentUserID,   // ID врача
			dateParsed,      // time.Time (для DATE)
			startTimeParsed, // time.Time (для TIME)
			endTimeParsed,   // time.Time (для TIME)
			true,            // is_available
		).Scan(&slotID)

		if err != nil {
			// Проверяем на уникальность слота (если сработало UNIQUE constraint)
			if strings.Contains(err.Error(), "duplicate key value violates unique constraint") &&
				strings.Contains(err.Error(), "doctor_schedules_doctor_id_date_start_time_key") {
				c.JSON(http.StatusConflict, gin.H{"error": "Такой слот времени у данного врача на эту дату уже существует"})
				return
			}
			log.Printf("Schedules ERROR: Ошибка БД при добавлении слота: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при добавлении слота в базу данных"})
			return
		}

		// 6. Успешный ответ
		c.JSON(http.StatusCreated, ScheduleSlotModel{
			ID:          slotID,
			DoctorID:    currentUserID,
			Date:        req.Date,      // Возвращаем в строковом формате
			StartTime:   req.StartTime, // Возвращаем в строковом формате
			EndTime:     req.EndTime,   // Возвращаем в строковом формате
			IsAvailable: true,
		})
	}
}

// --- Хендлер для получения слотов текущего доктора ---
func GetMyScheduleSlotsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Получаем ID и роль пользователя из заголовков
		userIDStr := c.GetHeader("X-User-ID")
		userRole := c.GetHeader("X-User-Role")

		if userIDStr == "" || userRole == "" {
			log.Println("Schedules ERROR: Заголовки X-User-ID/X-User-Role отсутствуют для GET /my.")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Данные пользователя не получены от шлюза"})
			return
		}

		currentUserID, err := strconv.Atoi(userIDStr)
		if err != nil {
			log.Printf("Schedules ERROR: Неверный формат X-User-ID для GET /my: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка обработки ID пользователя"})
			return
		}

		// 2. Авторизация: Только врач может просматривать свое расписание через /my
		if userRole != "doctor" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Доступ запрещен. Только для врачей."})
			return
		}
		// currentUserID теперь точно ID врача

		// 3. Запрос к базе данных
		// Выбираем только будущие или сегодняшние слоты? Можно добавить `WHERE date >= CURRENT_DATE`
		// Пока выбираем все слоты этого врача
		query := `
            SELECT id, date, start_time, end_time, is_available
            FROM doctor_schedules
            WHERE doctor_id = $1
            ORDER BY date, start_time`

		rows, err := db.Query(query, currentUserID)
		if err != nil {
			log.Printf("Schedules ERROR: Ошибка БД при выборке слотов для доктора %d: %v", currentUserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении слотов из базы данных"})
			return
		}
		defer rows.Close()

		var slots []ScheduleSlotModel
		for rows.Next() {
			var s ScheduleSlotModel
			var dbDate time.Time // Сюда сканируем DATE
			// Время сканируем как строки, так как оно в формате HH:MM и так и нужно для ответа
			var dbStartTime string
			var dbEndTime string

			if err := rows.Scan(&s.ID, &dbDate, &dbStartTime, &dbEndTime, &s.IsAvailable); err != nil {
				log.Printf("Schedules ERROR: Ошибка сканирования строки слота для доктора %d: %v", currentUserID, err)
				// Не прерываем весь запрос, просто пропускаем эту строку
				continue
			}

			s.DoctorID = currentUserID
			s.Date = dbDate.Format("2006-01-02") // Форматируем дату в строку YYYY-MM-DD
			s.StartTime = dbStartTime
			s.EndTime = dbEndTime

			slots = append(slots, s)
		}

		// Проверяем на ошибки после цикла чтения строк
		if err = rows.Err(); err != nil {
			log.Printf("Schedules ERROR: Ошибка после чтения строк слотов для доктора %d: %v", currentUserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при обработке результатов из базы данных"})
			return
		}

		// 4. Успешный ответ (даже если список пустой)
		c.JSON(http.StatusOK, slots)
	}
}
