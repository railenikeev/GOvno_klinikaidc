package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

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
	DoctorID    int    `json:"doctor_id"`  // Включаем для полноты, хотя для /my это будет ID текущего врача
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

	// Маршруты определяются от корня роутера r
	// Группа r.Group("/schedules") УДАЛЕНА

	// POST / - Добавить новый слот (только для врача)
	// Фронтенд вызывает /api/schedules -> шлюз (path="") -> сервис schedules "/" (или "")
	r.POST("", CreateScheduleSlotHandler(db))

	// GET /my - Получить слоты текущего врача (только для врача)
	// Фронтенд вызывает /api/schedules/my -> шлюз (path="/my") -> сервис schedules "/my"
	r.GET("/my", GetMyScheduleSlotsHandler(db))

	// GET /doctor/:id - Получить слоты КОНКРЕТНОГО врача (для записи на прием)
	// Фронтенд вызывает /api/schedules/doctor/:id -> шлюз (path="/doctor/:id") -> сервис schedules "/doctor/:id"
	r.GET("/doctor/:id", GetDoctorScheduleSlotsHandler(db))

	// DELETE /:id - Удалить слот (только для врача-владельца или админа)
	// Фронтенд вызывает /api/schedules/:id -> шлюз (path="/:id") -> сервис schedules "/:id"
	r.DELETE("/:id", DeleteScheduleSlotHandler(db))

	port := ":8082"
	log.Printf("Schedules service запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска Schedules service: %v", err)
	}
}

// --- Хендлер для добавления слота ---
func CreateScheduleSlotHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		currentUserID, userRole, err := getUserInfo(c) // Используем обновленный getUserInfo
		if err != nil {
			log.Printf("Schedules ERROR: CreateScheduleSlotHandler - getUserInfo: %v", err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
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
		// Проверка времени на корректность формата HH:MM (уже делается на фронте, но дублируем)
		_, errStartTime := time.Parse("15:04", req.StartTime)
		_, errEndTime := time.Parse("15:04", req.EndTime)
		if errStartTime != nil || errEndTime != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат времени (ожидается HH:MM)"})
			return
		}
		// Сравнение времени как строк (простая проверка, лучше парсить в time.Time для сравнения, но для HH:MM строк это тоже сработает)
		if req.EndTime <= req.StartTime {
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
		// Вставляем время как строки HH:MM, так как в БД тип TIME
		err = db.QueryRow(query,
			currentUserID, dateParsed, req.StartTime, req.EndTime, true,
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

		log.Printf("Schedules INFO: Добавлен слот ID %d для врача %d на %s %s-%s", slotID, currentUserID, req.Date, req.StartTime, req.EndTime)
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
		currentUserID, userRole, err := getUserInfo(c)
		if err != nil {
			log.Printf("Schedules ERROR: GetMyScheduleSlotsHandler - getUserInfo: %v", err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		if userRole != "doctor" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Доступ запрещен. Только для врачей."})
			return
		}

		query := `
            SELECT id, doctor_id, date, start_time, end_time, is_available
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

		slots := make([]ScheduleSlotModel, 0)

		for rows.Next() {
			var s ScheduleSlotModel
			var dbDate time.Time
			var dbStartTime, dbEndTime time.Time // <--- ИЗМЕНЕНИЕ: Сканируем напрямую в time.Time

			// Предполагаем, что драйвер PostgreSQL корректно сканирует TIME в time.Time
			// Дата будет 0000-01-01 или 0001-01-01, время будет правильным, часовой пояс UTC
			if errScan := rows.Scan(&s.ID, &s.DoctorID, &dbDate, &dbStartTime, &dbEndTime, &s.IsAvailable); errScan != nil {
				log.Printf("Schedules ERROR: Ошибка сканирования строки слота для доктора %d: %v", currentUserID, errScan)
				continue
			}

			s.Date = dbDate.Format("2006-01-02")
			s.StartTime = dbStartTime.Format("15:04") // Форматируем только время
			s.EndTime = dbEndTime.Format("15:04")     // Форматируем только время

			slots = append(slots, s)
		}

		if err = rows.Err(); err != nil {
			log.Printf("Schedules ERROR: Ошибка после чтения строк слотов для доктора %d: %v", currentUserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при обработке результатов из базы данных"})
			return
		}
		log.Printf("Schedules INFO: Получены слоты для доктора %d, количество: %d", currentUserID, len(slots))
		c.JSON(http.StatusOK, slots)
	}
}

// --- Хендлер для получения слотов КОНКРЕТНОГО врача ---
func GetDoctorScheduleSlotsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		_, _, errAuth := getUserInfo(c)
		if errAuth != nil {
			log.Println("Schedules WARN: Запрос к /doctor/:id без заголовков пользователя.")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется аутентификация через шлюз"})
			return
		}

		doctorIDStr := c.Param("id")
		doctorID, err := strconv.Atoi(doctorIDStr)
		// ... (остальная часть функции до цикла rows.Next() такая же) ...
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID врача"})
			return
		}

		showOnlyAvailable := c.Query("available")
		startDateStr := c.Query("startDate")

		query := `
            SELECT id, doctor_id, date, start_time, end_time, is_available
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
			parsedDate, errDateParse := time.Parse("2006-01-02", startDateStr)
			if errDateParse == nil {
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

		query += " ORDER BY date, start_time"

		rows, err := db.Query(query, args...)
		if err != nil {
			log.Printf("Schedules ERROR: Ошибка БД при выборке слотов для врача %d: %v", doctorID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении слотов из базы данных"})
			return
		}
		defer rows.Close()

		slots := make([]ScheduleSlotModel, 0)

		for rows.Next() {
			var s ScheduleSlotModel
			var dbDate time.Time
			var dbStartTime, dbEndTime time.Time // <--- ИЗМЕНЕНИЕ: Сканируем напрямую в time.Time

			if errScan := rows.Scan(&s.ID, &s.DoctorID, &dbDate, &dbStartTime, &dbEndTime, &s.IsAvailable); errScan != nil {
				log.Printf("Schedules ERROR: Ошибка сканирования строки слота для врача %d: %v", doctorID, errScan)
				continue
			}
			s.Date = dbDate.Format("2006-01-02")
			s.StartTime = dbStartTime.Format("15:04") // Форматируем только время
			s.EndTime = dbEndTime.Format("15:04")     // Форматируем только время

			slots = append(slots, s)
		}

		if err = rows.Err(); err != nil {
			log.Printf("Schedules ERROR: Ошибка после чтения строк слотов для врача %d: %v", doctorID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при обработке результатов из базы"})
			return
		}
		log.Printf("Schedules INFO: Получены слоты для врача %d, параметры (available: %s, startDate: %s), количество: %d", doctorID, showOnlyAvailable, startDateStr, len(slots))
		c.JSON(http.StatusOK, slots)
	}
}

// --- Хендлер для удаления слота ---
// (DeleteScheduleSlotHandler остается без изменений по сравнению с предыдущей версией, где он был уже исправлен)
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
			c.JSON(http.StatusForbidden, gin.H{"error": "Доступ запрещен. Вы не можете удалить этот слот."})
			return
		}

		if !isAvailable {
			var appointmentCount int
			apptCheckQuery := "SELECT COUNT(*) FROM appointments WHERE doctor_schedule_id = $1 AND status = 'scheduled'"
			errAppt := db.QueryRow(apptCheckQuery, slotID).Scan(&appointmentCount)
			if errAppt != nil && !errors.Is(errAppt, sql.ErrNoRows) {
				log.Printf("Schedules ERROR: Ошибка проверки записей для слота %d: %v", slotID, errAppt)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при проверке связанных записей"})
				return
			}
			if appointmentCount > 0 {
				c.JSON(http.StatusConflict, gin.H{"error": "Нельзя удалить слот, на который есть активная запись. Сначала отмените запись."})
				return
			}
			log.Printf("Schedules WARN: Попытка удаления занятого слота %d (без активных записей) пользователем %d (роль %s)", slotID, requestUserID, requestUserRole)
			// Разрешаем удаление, если активных записей нет, даже если is_available=false (админ/врач разбирается)
		}

		// Удаляем слот
		deleteQuery := "DELETE FROM doctor_schedules WHERE id = $1"
		result, err := db.Exec(deleteQuery, slotID)
		if err != nil {
			log.Printf("Schedules ERROR: Ошибка при удалении слота %d: %v", slotID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при удалении слота"})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			log.Printf("Schedules WARN: Попытка удаления слота %d не затронула строк.", slotID)
			c.JSON(http.StatusNotFound, gin.H{"error": "Слот не найден (возможно, был удален ранее)"})
			return
		}

		log.Printf("Schedules INFO: Слот %d успешно удален пользователем %d (роль %s)", slotID, requestUserID, requestUserRole)
		c.Status(http.StatusNoContent)
	}
}
