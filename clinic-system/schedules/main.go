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

	// --- ИЗМЕНЕНИЕ ЗДЕСЬ: Маршруты теперь определяются от корня роутера r ---
	// Группировка r.Group("/schedules") УДАЛЕНА или заменена на r.Group("")

	// POST "" - Добавить новый слот (только для врача)
	// Фронтенд вызывает /api/schedules -> шлюз /schedules/*path (path="") -> сервис schedules "/"
	// Если ваш шлюз для /api/schedules передает пустой path, то этот маршрут должен быть "/" или ""
	// В вашем шлюзе: authGroup.Any("/schedules/*path", ...)
	// Если запрос /api/schedules, то path будет "/". Если /api/schedules/, то path тоже будет "/".
	// Если запрос /api/schedules (без слэша в конце), и proxy добавляет слэш, то будет "/".
	// Поэтому POST на "" (т.е. корень сервиса) должен быть правильным.
	r.POST("", CreateScheduleSlotHandler(db)) // Если шлюз проксирует /api/schedules на корень сервиса schedules

	// GET /my - Получить слоты текущего врача (только для врача)
	// Фронтенд вызывает /api/schedules/my -> шлюз /schedules/*path (path="/my") -> сервис schedules "/my"
	r.GET("/my", GetMyScheduleSlotsHandler(db))

	// GET /doctor/:id - Получить слоты КОНКРЕТНОГО врача (для записи на прием)
	// Фронтенд вызывает /api/schedules/doctor/:id -> шлюз /schedules/*path (path="/doctor/:id") -> сервис schedules "/doctor/:id"
	r.GET("/doctor/:id", GetDoctorScheduleSlotsHandler(db))

	// DELETE /:id - Удалить слот (только для врача-владельца или админа)
	// Фронтенд вызывает /api/schedules/:id -> шлюз /schedules/*path (path="/:id") -> сервис schedules "/:id"
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
		startTimeParsed, err := time.Parse("15:04", req.StartTime) // Используем "15:04" для HH:MM
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат времени начала (ожидается HH:MM)"})
			return
		}
		endTimeParsed, err := time.Parse("15:04", req.EndTime) // Используем "15:04" для HH:MM
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат времени окончания (ожидается HH:MM)"})
			return
		}

		if !endTimeParsed.After(startTimeParsed) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Время окончания должно быть позже времени начала"})
			return
		}
		// Проверка, что дата не в прошлом
		// Truncate для сравнения только дат, без времени
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
			Date:        req.Date, // Возвращаем в формате YYYY-MM-DD
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
			// PostgreSQL TIME тип будет сканироваться в строку Go в формате "15:04:05" или "15:04:05.999999"
			// Если в БД хранится как TIME, то лучше сканировать в строку, а не в time.Time
			var dbStartTimeStr string
			var dbEndTimeStr string

			if errScan := rows.Scan(&s.ID, &dbDate, &dbStartTimeStr, &dbEndTimeStr, &s.IsAvailable); errScan != nil {
				log.Printf("Schedules ERROR: Ошибка сканирования строки слота для доктора %d: %v", currentUserID, errScan)
				continue
			}

			s.DoctorID = currentUserID
			s.Date = dbDate.Format("2006-01-02") // Форматируем дату

			// Обрезаем секунды, если они есть (PostgreSQL TIME может их возвращать)
			s.StartTime = strings.Split(dbStartTimeStr, ":")[0] + ":" + strings.Split(dbStartTimeStr, ":")[1]
			s.EndTime = strings.Split(dbEndTimeStr, ":")[0] + ":" + strings.Split(dbEndTimeStr, ":")[1]

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
		_, _, errAuth := getUserInfo(c) // Проверка аутентификации, но роль не важна для этого эндпоинта
		if errAuth != nil {
			log.Println("Schedules WARN: Запрос к /doctor/:id без заголовков пользователя.")
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
		argCounter := 2 // Начинаем со второго аргумента ($2)

		if showOnlyAvailable == "true" || showOnlyAvailable == "" { // По умолчанию показываем только доступные
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
			startDate = time.Now().Truncate(24 * time.Hour) // По умолчанию с сегодняшнего дня
		}
		query += fmt.Sprintf(" AND date >= $%d", argCounter)
		args = append(args, startDate)
		// argCounter++ // Уже не нужен, т.к. это последний аргумент

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
			var dbStartTimeStr string
			var dbEndTimeStr string

			if errScan := rows.Scan(&s.ID, &dbDate, &dbStartTimeStr, &dbEndTimeStr, &s.IsAvailable); errScan != nil {
				log.Printf("Schedules ERROR: Ошибка сканирования строки слота для врача %d: %v", doctorID, errScan)
				continue
			}

			s.DoctorID = doctorID
			s.Date = dbDate.Format("2006-01-02")
			s.StartTime = strings.Split(dbStartTimeStr, ":")[0] + ":" + strings.Split(dbStartTimeStr, ":")[1]
			s.EndTime = strings.Split(dbEndTimeStr, ":")[0] + ":" + strings.Split(dbEndTimeStr, ":")[1]
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

		// Сначала получаем информацию о слоте, чтобы проверить владельца и доступность
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

		// Проверка прав на удаление
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

		// Проверка, не занят ли слот (хотя фронтенд тоже должен это проверять)
		if !isAvailable {
			// Проверяем, есть ли запись на этот слот
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
			// Если активных записей нет, но слот is_available=false (например, запись была отменена без освобождения слота)
			// то администратор может его удалить. Врач, возможно, тоже.
			// Пока оставляем первоначальную логику: если !isAvailable, то нельзя удалить (защита от гонки состояний)
			// Если слот был занят, но запись отменена, is_available должно было стать true.
			// Поэтому, если is_available = false, это значит, что на него ЕСТЬ запись, и ее нужно отменить через appointments сервис.
			log.Printf("Schedules WARN: Попытка удаления занятого слота %d пользователем %d (роль %s)", slotID, requestUserID, requestUserRole)
			c.JSON(http.StatusConflict, gin.H{"error": "Нельзя удалить уже занятый слот. Если запись отменена, слот должен был освободиться."})
			return
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
			// Это может случиться, если слот был удален другим запросом между проверкой и удалением
			log.Printf("Schedules WARN: Попытка удаления слота %d не затронула строк (возможно, уже удален).", slotID)
			c.JSON(http.StatusNotFound, gin.H{"error": "Слот не найден (возможно, был удален ранее)"})
			return
		}

		log.Printf("Schedules INFO: Слот %d успешно удален пользователем %d (роль %s)", slotID, requestUserID, requestUserRole)
		c.Status(http.StatusNoContent) // Успешное удаление
	}
}
