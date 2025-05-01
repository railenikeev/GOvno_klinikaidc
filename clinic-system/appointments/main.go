package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time" // Добавлен для created_at

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

// --- Структуры для API ---

// Структура для создания записи (POST /)
type CreateAppointmentRequest struct {
	DoctorScheduleID int `json:"doctor_schedule_id" binding:"required"`
}

// Структура для ответа при создании или получении одной записи
type AppointmentResponse struct {
	ID               int       `json:"id"`
	PatientID        int       `json:"patient_id"`
	DoctorScheduleID int       `json:"doctor_schedule_id"`
	Status           string    `json:"status"`
	CreatedAt        time.Time `json:"created_at"`
	// Дополнительные поля для детализации (заполняются при GET)
	DoctorID           *int    `json:"doctor_id,omitempty"`
	DoctorName         *string `json:"doctor_name,omitempty"`
	SpecializationName *string `json:"specialization_name,omitempty"`
	PatientName        *string `json:"patient_name,omitempty"`
	Date               *string `json:"date,omitempty"`       // YYYY-MM-DD
	StartTime          *string `json:"start_time,omitempty"` // HH:MM
	EndTime            *string `json:"end_time,omitempty"`   // HH:MM
}

// Структура для обновления статуса (PATCH /:id/status)
type UpdateAppointmentStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=scheduled completed cancelled"` // Ограничиваем возможные статусы
}

// --- Хелпер для получения ID и роли ---
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
	log.Println("Успешное подключение к БД (Appointments service)!")

	r := gin.Default()

	// Группа маршрутов /appointments
	// Сервис полагается на заголовки от Gateway
	apptRoutes := r.Group("/appointments")
	{
		// POST /appointments - Создать новую запись (для пациента)
		apptRoutes.POST("", createAppointmentHandler(db))

		// GET /appointments/my/patient - Получить записи текущего пациента
		apptRoutes.GET("/my/patient", getMyAppointmentsPatientHandler(db))

		// GET /appointments/my/doctor - Получить записи текущего врача
		apptRoutes.GET("/my/doctor", getMyAppointmentsDoctorHandler(db)) // Переименовали старый /my

		// PATCH /appointments/:id/status - Обновить статус записи (для врача или админа)
		apptRoutes.PATCH("/:id/status", updateAppointmentStatusHandler(db))

		// GET /appointments/:id - Получить детали одной записи (опционально, для пациента/врача/админа)
		// apptRoutes.GET("/:id", getAppointmentDetailsHandler(db))

		// DELETE /appointments/:id - Отменить запись (для пациента или админа?)
		// apptRoutes.DELETE("/:id", cancelAppointmentHandler(db))

	}

	port := ":8083" // Порт по умолчанию для сервиса записей
	log.Printf("Appointments service запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска Appointments service: %v", err)
	}
}

// --- Обработчики ---

// POST /appointments
func createAppointmentHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		patientID, userRole, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		// Только пациент может создавать запись
		if userRole != "patient" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Только пациенты могут создавать записи"})
			return
		}

		var req CreateAppointmentRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}

		// --- Транзакция ---
		tx, err := db.Begin()
		if err != nil {
			log.Printf("Appointments ERROR: Не удалось начать транзакцию: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при начале транзакции"})
			return
		}
		// Гарантируем откат транзакции в случае ошибки перед выходом из функции
		defer func() {
			if p := recover(); p != nil {
				tx.Rollback() // Откат при панике
				panic(p)      // Продолжаем панику
			} else if err != nil {
				tx.Rollback() // Откат при обычной ошибке
			}
		}()

		// 1. Проверить и заблокировать слот (сделать недоступным)
		// FOR UPDATE - блокирует строку до конца транзакции
		updateSlotQuery := `
            UPDATE doctor_schedules
            SET is_available = false
            WHERE id = $1 AND is_available = true
            RETURNING id`
		var updatedSlotID int
		err = tx.QueryRow(updateSlotQuery, req.DoctorScheduleID).Scan(&updatedSlotID)

		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				// Либо слота нет, либо он уже занят (is_available = false)
				err = errors.New("выбранный слот недоступен или не существует")
				c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
				return // Rollback будет выполнен defer'ом
			}
			log.Printf("Appointments ERROR: Ошибка при обновлении слота %d: %v", req.DoctorScheduleID, err)
			err = errors.New("ошибка сервера при бронировании слота") // Общая ошибка для клиента
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return // Rollback будет выполнен defer'ом
		}

		// 2. Создать запись в appointments
		insertApptQuery := `
            INSERT INTO appointments (patient_id, doctor_schedule_id, status)
            VALUES ($1, $2, $3)
            RETURNING id, created_at, status`
		var createdAppt AppointmentResponse
		createdAppt.PatientID = patientID
		createdAppt.DoctorScheduleID = req.DoctorScheduleID

		err = tx.QueryRow(insertApptQuery, patientID, req.DoctorScheduleID, "scheduled").
			Scan(&createdAppt.ID, &createdAppt.CreatedAt, &createdAppt.Status)

		if err != nil {
			// Возможные ошибки: нарушение внешних ключей (хотя слот мы проверили)
			log.Printf("Appointments ERROR: Ошибка при создании записи для слота %d: %v", req.DoctorScheduleID, err)
			err = errors.New("ошибка сервера при создании записи")
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return // Rollback будет выполнен defer'ом
		}

		// 3. Подтвердить транзакцию
		err = tx.Commit()
		if err != nil {
			log.Printf("Appointments ERROR: Не удалось подтвердить транзакцию для слота %d: %v", req.DoctorScheduleID, err)
			err = errors.New("ошибка сервера при подтверждении записи")
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// --- Транзакция успешно завершена ---

		// Опционально: можно инициировать уведомление
		// notifyService(...)

		c.JSON(http.StatusCreated, createdAppt) // Возвращаем базовую информацию о созданной записи
	}
}

// GET /appointments/my/patient
func getMyAppointmentsPatientHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		patientID, userRole, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		if userRole != "patient" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Доступ запрещен"})
			return
		}

		query := `
            SELECT
                a.id, a.patient_id, a.doctor_schedule_id, a.status, a.created_at,
                ds.date, ds.start_time, ds.end_time,
                doc.id as doctor_id, doc.full_name as doctor_name,
                spec.name as specialization_name
            FROM appointments a
            JOIN doctor_schedules ds ON a.doctor_schedule_id = ds.id
            JOIN users doc ON ds.doctor_id = doc.id
            LEFT JOIN specializations spec ON doc.specialization_id = spec.id
            WHERE a.patient_id = $1
            ORDER BY ds.date DESC, ds.start_time DESC`

		rows, err := db.Query(query, patientID)
		if err != nil {
			log.Printf("Appointments ERROR: Ошибка БД при получении записей пациента %d: %v", patientID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении записей"})
			return
		}
		defer rows.Close()

		appointments := []AppointmentResponse{}
		for rows.Next() {
			var appt AppointmentResponse
			var specName sql.NullString // Для nullable specialization name
			var date time.Time          // Для сканирования DATE
			var startTime string        // Для сканирования TIME как строки
			var endTime string          // Для сканирования TIME как строки

			err := rows.Scan(
				&appt.ID, &appt.PatientID, &appt.DoctorScheduleID, &appt.Status, &appt.CreatedAt,
				&date, &startTime, &endTime, // Используем временные переменные
				&appt.DoctorID, &appt.DoctorName, &specName,
			)
			if err != nil {
				log.Printf("Appointments ERROR: Ошибка сканирования записи пациента %d: %v", patientID, err)
				continue // Пропускаем эту запись
			}

			// Форматируем и присваиваем
			dateStr := date.Format("2006-01-02")
			appt.Date = &dateStr
			appt.StartTime = &startTime
			appt.EndTime = &endTime
			if specName.Valid {
				name := specName.String
				appt.SpecializationName = &name
			}

			appointments = append(appointments, appt)
		}

		if err = rows.Err(); err != nil {
			log.Printf("Appointments ERROR: Ошибка после чтения строк записей пациента %d: %v", patientID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при обработке записей"})
			return
		}

		c.JSON(http.StatusOK, appointments)
	}
}

// GET /appointments/my/doctor
func getMyAppointmentsDoctorHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		doctorID, userRole, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		if userRole != "doctor" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Доступ запрещен"})
			return
		}

		query := `
            SELECT
                a.id, a.patient_id, a.doctor_schedule_id, a.status, a.created_at,
                ds.date, ds.start_time, ds.end_time,
                pat.full_name as patient_name
            FROM appointments a
            JOIN doctor_schedules ds ON a.doctor_schedule_id = ds.id
            JOIN users pat ON a.patient_id = pat.id
            WHERE ds.doctor_id = $1
            ORDER BY ds.date DESC, ds.start_time DESC`

		rows, err := db.Query(query, doctorID)
		if err != nil {
			log.Printf("Appointments ERROR: Ошибка БД при получении записей врача %d: %v", doctorID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении записей"})
			return
		}
		defer rows.Close()

		appointments := []AppointmentResponse{}
		for rows.Next() {
			var appt AppointmentResponse
			var date time.Time
			var startTime string
			var endTime string

			err := rows.Scan(
				&appt.ID, &appt.PatientID, &appt.DoctorScheduleID, &appt.Status, &appt.CreatedAt,
				&date, &startTime, &endTime,
				&appt.PatientName, // Сканируем имя пациента
			)
			if err != nil {
				log.Printf("Appointments ERROR: Ошибка сканирования записи врача %d: %v", doctorID, err)
				continue
			}

			dateStr := date.Format("2006-01-02")
			appt.Date = &dateStr
			appt.StartTime = &startTime
			appt.EndTime = &endTime
			appt.DoctorID = &doctorID // Добавляем ID врача в ответ

			appointments = append(appointments, appt)
		}

		if err = rows.Err(); err != nil {
			log.Printf("Appointments ERROR: Ошибка после чтения строк записей врача %d: %v", doctorID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при обработке записей"})
			return
		}

		c.JSON(http.StatusOK, appointments)
	}
}

// PATCH /appointments/:id/status
func updateAppointmentStatusHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestUserID, requestUserRole, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		appointmentIDStr := c.Param("id")
		appointmentID, err := strconv.Atoi(appointmentIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID записи"})
			return
		}

		var req UpdateAppointmentStatusRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}

		// --- Проверка прав ---
		// Получаем ID врача, связанного с этой записью
		var actualDoctorID int
		checkQuery := `
            SELECT ds.doctor_id
            FROM appointments a
            JOIN doctor_schedules ds ON a.doctor_schedule_id = ds.id
            WHERE a.id = $1`
		err = db.QueryRow(checkQuery, appointmentID).Scan(&actualDoctorID)

		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Запись не найдена"})
				return
			}
			log.Printf("Appointments ERROR: Ошибка при проверке прав на запись %d: %v", appointmentID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при проверке прав"})
			return
		}

		// Разрешаем действие, если пользователь - админ ИЛИ если это врач, которому принадлежит запись
		canUpdate := false
		if requestUserRole == "admin" {
			canUpdate = true
		} else if requestUserRole == "doctor" && requestUserID == actualDoctorID {
			canUpdate = true
		}

		if !canUpdate {
			c.JSON(http.StatusForbidden, gin.H{"error": "Доступ запрещен"})
			return
		}
		// --- Конец проверки прав ---

		// Обновляем статус
		updateQuery := `UPDATE appointments SET status = $1 WHERE id = $2`
		result, err := db.Exec(updateQuery, req.Status, appointmentID)
		if err != nil {
			log.Printf("Appointments ERROR: Ошибка при обновлении статуса записи %d: %v", appointmentID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при обновлении статуса"})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			// Это не должно произойти, если проверка прав прошла успешно, но на всякий случай
			c.JSON(http.StatusNotFound, gin.H{"error": "Запись не найдена (или статус не изменился)"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Статус записи успешно обновлен"})
	}
}
