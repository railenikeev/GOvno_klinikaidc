package main

import (
	"database/sql"
	"errors" // Добавлен для sql.ErrNoRows и errors.New
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings" // Добавлен для проверки ошибок БД
	"time"    // Убедимся, что time импортирован

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

// --- Хелпер для получения User Info (можно вынести в общий пакет) ---
func getUserInfo(c *gin.Context) (userID int, userRole string, err error) {
	idStr := c.GetHeader("X-User-ID")
	role := c.GetHeader("X-User-Role")

	if idStr == "" || role == "" {
		err = errors.New("данные пользователя не получены от шлюза")
		return
	}

	userID, err = strconv.Atoi(idStr)
	if err != nil {
		err = errors.New("ошибка обработки ID пользователя")
		return
	}
	userRole = role
	return
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
	schedulesRoutes := r.Group("/schedules")
	{
		// POST /schedules - Добавить новый слот (только для врача)
		schedulesRoutes.POST("", CreateScheduleSlotHandler(db))

		// GET /schedules/my - Получить слоты текущего врача (только для врача)
		schedulesRoutes.GET("/my", GetMyScheduleSlotsHandler(db))

		// GET /schedules/doctor/:id - Получить слоты КОНКРЕТНОГО врача (для записи на прием)
		schedulesRoutes.GET("/doctor/:id", GetDoctorScheduleSlotsHandler(db)) // <-- Новый маршрут

		// DELETE /schedules/:id - Удалить слот (только для врача-владельца или админа)
		schedulesRoutes.DELETE("/:id", DeleteScheduleSlotHandler(db)) // <-- Новый маршрут
	}

	port := ":8082"
	log.Printf("Schedules service запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска Schedules service: %v", err)
	}
}

// --- Хендлер для добавления слота ---
func CreateScheduleSlotHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
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

		if userRole != "doctor" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Доступ запрещен. Только врачи могут добавлять слоты."})
			return
		}

		var req CreateSlotRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}

		dateParsed, err := time.Parse("2006-01-02", req.Date)
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
		today := time.Now().Truncate(24 * time.Hour)
		if dateParsed.Before(today) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Нельзя добавить слот на прошедшую дату"})
			return
		}

		query := `INSERT INTO doctor_schedules (doctor_id, date, start_time, end_time, is_available)
                  VALUES ($1, $2, $3, $4, $5) RETURNING id`

		var slotID int
		err = db.QueryRow(query,
			currentUserID, dateParsed, startTimeParsed, endTimeParsed, true,
		).Scan(&slotID)

		if err != nil {
			if strings.Contains(err.Error(), "duplicate key value violates unique constraint") &&
				strings.Contains(err.Error(), "doctor_schedules_doctor_id_date_start_time_key") {
				c.JSON(http.StatusConflict, gin.H{"error": "Такой слот времени у данного врача на эту дату уже существует"})
				return
			}
			log.Printf("Schedules ERROR: Ошибка БД при добавлении слота: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при добавлении слота в базу данных"})
			return
		}

		c.JSON(http.StatusCreated, ScheduleSlotModel{
			ID: slotID, DoctorID: currentUserID, Date: req.Date,
			StartTime: req.StartTime, EndTime: req.EndTime, IsAvailable: true,
		})
	}
}

// --- Хендлер для получения слотов текущего доктора ---
func GetMyScheduleSlotsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		currentUserID, userRole, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		if userRole != "doctor" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Доступ запрещен. Только для врачей."})
			return
		}

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
			var dbDate time.Time
			var dbStartTime string
			var dbEndTime string

			if err := rows.Scan(&s.ID, &dbDate, &dbStartTime, &dbEndTime, &s.IsAvailable); err != nil {
				log.Printf("Schedules ERROR: Ошибка сканирования строки слота для доктора %d: %v", currentUserID, err)
				continue
			}

			s.DoctorID = currentUserID
			s.Date = dbDate.Format("2006-01-02")
			s.StartTime = dbStartTime
			s.EndTime = dbEndTime

			slots = append(slots, s)
		}

		if err = rows.Err(); err != nil {
			log.Printf("Schedules ERROR: Ошибка после чтения строк слотов для доктора %d: %v", currentUserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при обработке результатов из базы данных"})
			return
		}

		c.JSON(http.StatusOK, slots)
	}
}

/* --- НОВЫЙ Хендлер для получения слотов КОНКРЕТНОГО врача --- */
func GetDoctorScheduleSlotsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Проверяем наличие заголовков аутентификации от шлюза
		_, _, errAuth := getUserInfo(c)
		if errAuth != nil {
			log.Println("Schedules WARN: Запрос к /schedules/doctor/:id без заголовков пользователя.")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется аутентификация через шлюз"})
			return
		}

		doctorIDStr := c.Param("id")
		doctorID, err := strconv.Atoi(doctorIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID врача"})
			return
		}

		showOnlyAvailable := c.Query("available")
		startDateStr := c.Query("startDate")

		query := `
            SELECT id, date, start_time, end_time, is_available
            FROM doctor_schedules
            WHERE doctor_id = $1`
		args := []interface{}{doctorID}
		argCounter := 2

		if showOnlyAvailable == "true" || showOnlyAvailable == "" {
			query += fmt.Sprintf(" AND is_available = $%d", argCounter)
			args = append(args, true)
			argCounter++
		}

		var startDate time.Time
		if startDateStr != "" {
			parsedDate, err := time.Parse("2006-01-02", startDateStr)
			if err == nil {
				startDate = parsedDate
			} else {
				log.Printf("Schedules WARN: Неверный формат startDate '%s', используется текущая дата.", startDateStr)
				startDate = time.Now().Truncate(24 * time.Hour)
			}
		} else {
			startDate = time.Now().Truncate(24 * time.Hour)
		}
		query += fmt.Sprintf(" AND date >= $%d", argCounter)
		args = append(args, startDate)
		argCounter++

		query += " ORDER BY date, start_time"

		rows, err := db.Query(query, args...)
		if err != nil {
			log.Printf("Schedules ERROR: Ошибка БД при выборке слотов для врача %d: %v", doctorID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении слотов из базы данных"})
			return
		}
		defer rows.Close()

		var slots []ScheduleSlotModel
		for rows.Next() {
			var s ScheduleSlotModel
			var dbDate time.Time
			var dbStartTime string
			var dbEndTime string

			if err := rows.Scan(&s.ID, &dbDate, &dbStartTime, &dbEndTime, &s.IsAvailable); err != nil {
				log.Printf("Schedules ERROR: Ошибка сканирования строки слота для врача %d: %v", doctorID, err)
				continue
			}

			s.DoctorID = doctorID
			s.Date = dbDate.Format("2006-01-02")
			s.StartTime = dbStartTime
			s.EndTime = dbEndTime
			slots = append(slots, s)
		}

		if err = rows.Err(); err != nil {
			log.Printf("Schedules ERROR: Ошибка после чтения строк слотов для врача %d: %v", doctorID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при обработке результатов из базы"})
			return
		}

		c.JSON(http.StatusOK, slots)
	}
}

/* --- НОВЫЙ Хендлер для удаления слота --- */
func DeleteScheduleSlotHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestUserID, requestUserRole, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		slotIDStr := c.Param("id")
		slotID, err := strconv.Atoi(slotIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID слота"})
			return
		}

		var ownerDoctorID int
		var isAvailable bool
		checkQuery := "SELECT doctor_id, is_available FROM doctor_schedules WHERE id = $1"
		err = db.QueryRow(checkQuery, slotID).Scan(&ownerDoctorID, &isAvailable)

		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Слот не найден"})
				return
			}
			log.Printf("Schedules ERROR: Ошибка при проверке слота %d перед удалением: %v", slotID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при проверке слота"})
			return
		}

		canDelete := false
		if requestUserRole == "admin" {
			canDelete = true
		} else if requestUserRole == "doctor" && requestUserID == ownerDoctorID {
			canDelete = true
		}

		if !canDelete {
			c.JSON(http.StatusForbidden, gin.H{"error": "Доступ запрещен"})
			return
		}

		if !isAvailable {
			c.JSON(http.StatusConflict, gin.H{"error": "Нельзя удалить уже занятый слот"})
			return
		}

		deleteQuery := "DELETE FROM doctor_schedules WHERE id = $1"
		result, err := db.Exec(deleteQuery, slotID)
		if err != nil {
			log.Printf("Schedules ERROR: Ошибка при удалении слота %d: %v", slotID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при удалении слота"})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			log.Printf("Schedules WARN: Попытка удаления слота %d не затронула строк (возможно, уже удален).", slotID)
			c.JSON(http.StatusNotFound, gin.H{"error": "Слот не найден (возможно, был удален ранее)"})
			return
		}

		log.Printf("Schedules INFO: Слот %d успешно удален пользователем %d (роль %s)", slotID, requestUserID, requestUserRole)
		c.Status(http.StatusNoContent)
	}
}
