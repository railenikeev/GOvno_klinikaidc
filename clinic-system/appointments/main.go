package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

// --- Структуры для API ---
type CreateAppointmentRequest struct {
	DoctorScheduleID int `json:"doctor_schedule_id" binding:"required"`
}

// Эта структура подходит и для админа, т.к. содержит все нужные поля
type AppointmentResponse struct {
	ID                 int       `json:"id"`
	PatientID          int       `json:"patient_id"`
	DoctorScheduleID   int       `json:"doctor_schedule_id"`
	Status             string    `json:"status"`
	CreatedAt          time.Time `json:"created_at"`
	DoctorID           *int      `json:"doctor_id,omitempty"`
	DoctorName         *string   `json:"doctor_name,omitempty"`
	SpecializationName *string   `json:"specialization_name,omitempty"`
	PatientName        *string   `json:"patient_name,omitempty"`
	Date               *string   `json:"date,omitempty"`
	StartTime          *string   `json:"start_time,omitempty"`
	EndTime            *string   `json:"end_time,omitempty"`
}

type UpdateAppointmentStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=scheduled completed cancelled"`
}

// --- Хелперы ---
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

// Middleware для проверки роли Администратора
func adminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		_, role, err := getUserInfo(c)
		if err != nil {
			log.Printf("ADMIN AUTH ERROR (Appointments): %v", err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Ошибка аутентификации"})
			c.Abort()
			return
		}
		if role != "admin" {
			log.Printf("ADMIN AUTH WARN (Appointments): Попытка доступа ролью '%s'", role)
			c.JSON(http.StatusForbidden, gin.H{"error": "Доступ запрещен"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL не задана")
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

	// --- ИЗМЕНЕНИЕ ЗДЕСЬ: Маршруты определяются от корня роутера r ---
	// Группа r.Group("/appointments") УДАЛЕНА

	// POST / -> для создания записи (ранее было apptRoutes.POST(""))
	r.POST("", createAppointmentHandler(db))

	// GET /my/patient -> для получения записей пациента (ранее apptRoutes.GET("/my/patient",...))
	r.GET("/my/patient", getMyAppointmentsPatientHandler(db))

	// GET /my/doctor -> для получения записей врача (ранее apptRoutes.GET("/my/doctor",...))
	r.GET("/my/doctor", getMyAppointmentsDoctorHandler(db))

	// PATCH /:id/status -> для изменения статуса (ранее apptRoutes.PATCH("/:id/status",...))
	r.PATCH("/:id/status", updateAppointmentStatusHandler(db))

	// DELETE /:id -> для отмены/удаления (ранее apptRoutes.DELETE("/:id",...))
	r.DELETE("/:id", cancelAppointmentHandler(db))

	// GET / -> для получения всех записей админом (ранее apptRoutes.GET("", adminRequired(), ...))
	// Важно, чтобы этот маршрут не конфликтовал с POST /
	// Gin различает их по методу (GET vs POST), так что это должно быть нормально.
	r.GET("", adminRequired(), getAllAppointmentsHandler(db))

	port := ":8083"
	log.Printf("Appointments service запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска Appointments service: %v", err)
	}
}

// --- Обработчики ---

// POST /appointments
func createAppointmentHandler(db *sql.DB) gin.HandlerFunc {
	// ... (код без изменений) ...
	return func(c *gin.Context) {
		patientID, userRole, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		if userRole != "patient" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Только пациенты могут создавать записи"})
			return
		}
		var req CreateAppointmentRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}
		tx, err := db.Begin()
		if err != nil {
			log.Printf("Appointments ERROR: Не удалось начать транзакцию: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		defer func() {
			if p := recover(); p != nil {
				tx.Rollback()
				panic(p)
			} else if err != nil {
				tx.Rollback()
			}
		}()
		updateSlotQuery := `UPDATE doctor_schedules SET is_available = false WHERE id = $1 AND is_available = true RETURNING id`
		var updatedSlotID int
		err = tx.QueryRow(updateSlotQuery, req.DoctorScheduleID).Scan(&updatedSlotID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				err = errors.New("выбранный слот недоступен или не существует")
				c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
				return
			}
			log.Printf("Appointments ERROR: Ошибка при обновлении слота %d: %v", req.DoctorScheduleID, err)
			err = errors.New("ошибка сервера")
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		insertApptQuery := `INSERT INTO appointments (patient_id, doctor_schedule_id, status) VALUES ($1, $2, $3) RETURNING id, created_at, status`
		var createdAppt AppointmentResponse
		createdAppt.PatientID = patientID
		createdAppt.DoctorScheduleID = req.DoctorScheduleID
		err = tx.QueryRow(insertApptQuery, patientID, req.DoctorScheduleID, "scheduled").Scan(&createdAppt.ID, &createdAppt.CreatedAt, &createdAppt.Status)
		if err != nil {
			log.Printf("Appointments ERROR: Ошибка при создании записи для слота %d: %v", req.DoctorScheduleID, err)
			err = errors.New("ошибка сервера")
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		err = tx.Commit()
		if err != nil {
			log.Printf("Appointments ERROR: Не удалось подтвердить транзакцию для слота %d: %v", req.DoctorScheduleID, err)
			err = errors.New("ошибка сервера")
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, createdAppt)
	}
}

// GET /appointments/my/patient
func getMyAppointmentsPatientHandler(db *sql.DB) gin.HandlerFunc {
	// ... (код без изменений) ...
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
		query := ` SELECT a.id, a.patient_id, a.doctor_schedule_id, a.status, a.created_at, ds.date, ds.start_time, ds.end_time, doc.id as doctor_id, doc.full_name as doctor_name, spec.name as specialization_name FROM appointments a JOIN doctor_schedules ds ON a.doctor_schedule_id = ds.id JOIN users doc ON ds.doctor_id = doc.id LEFT JOIN specializations spec ON doc.specialization_id = spec.id WHERE a.patient_id = $1 ORDER BY ds.date DESC, ds.start_time DESC`
		rows, err := db.Query(query, patientID)
		if err != nil {
			log.Printf("Appointments ERROR: Ошибка БД (getMyAppointmentsPatient %d): %v", patientID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		defer rows.Close()
		appointments := []AppointmentResponse{}
		var specName sql.NullString
		var date time.Time
		var startTime, endTime string
		for rows.Next() {
			var appt AppointmentResponse
			err := rows.Scan(&appt.ID, &appt.PatientID, &appt.DoctorScheduleID, &appt.Status, &appt.CreatedAt, &date, &startTime, &endTime, &appt.DoctorID, &appt.DoctorName, &specName)
			if err != nil {
				log.Printf("Appointments ERROR: Ошибка сканирования (getMyAppointmentsPatient %d): %v", patientID, err)
				continue
			}
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
			log.Printf("Appointments ERROR: Ошибка итерации (getMyAppointmentsPatient %d): %v", patientID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		c.JSON(http.StatusOK, appointments)
	}
}

// GET /appointments/my/doctor
func getMyAppointmentsDoctorHandler(db *sql.DB) gin.HandlerFunc {
	// ... (код без изменений) ...
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
		query := ` SELECT a.id, a.patient_id, a.doctor_schedule_id, a.status, a.created_at, ds.date, ds.start_time, ds.end_time, pat.full_name as patient_name FROM appointments a JOIN doctor_schedules ds ON a.doctor_schedule_id = ds.id JOIN users pat ON a.patient_id = pat.id WHERE ds.doctor_id = $1 ORDER BY ds.date DESC, ds.start_time DESC`
		rows, err := db.Query(query, doctorID)
		if err != nil {
			log.Printf("Appointments ERROR: Ошибка БД (getMyAppointmentsDoctor %d): %v", doctorID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		defer rows.Close()
		appointments := []AppointmentResponse{}
		var date time.Time
		var startTime, endTime string
		for rows.Next() {
			var appt AppointmentResponse
			err := rows.Scan(&appt.ID, &appt.PatientID, &appt.DoctorScheduleID, &appt.Status, &appt.CreatedAt, &date, &startTime, &endTime, &appt.PatientName)
			if err != nil {
				log.Printf("Appointments ERROR: Ошибка сканирования (getMyAppointmentsDoctor %d): %v", doctorID, err)
				continue
			}
			dateStr := date.Format("2006-01-02")
			appt.Date = &dateStr
			appt.StartTime = &startTime
			appt.EndTime = &endTime
			appt.DoctorID = &doctorID
			appointments = append(appointments, appt)
		}
		if err = rows.Err(); err != nil {
			log.Printf("Appointments ERROR: Ошибка итерации (getMyAppointmentsDoctor %d): %v", doctorID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		c.JSON(http.StatusOK, appointments)
	}
}

// PATCH /appointments/:id/status
func updateAppointmentStatusHandler(db *sql.DB) gin.HandlerFunc {
	// ... (код без изменений) ...
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
		var actualDoctorID int
		checkQuery := `SELECT ds.doctor_id FROM appointments a JOIN doctor_schedules ds ON a.doctor_schedule_id = ds.id WHERE a.id = $1`
		err = db.QueryRow(checkQuery, appointmentID).Scan(&actualDoctorID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Запись не найдена"})
				return
			}
			log.Printf("Appointments ERROR: Ошибка проверки прав на запись %d: %v", appointmentID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
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
		updateQuery := `UPDATE appointments SET status = $1 WHERE id = $2`
		result, err := db.Exec(updateQuery, req.Status, appointmentID)
		if err != nil {
			log.Printf("Appointments ERROR: Ошибка обновления статуса записи %d: %v", appointmentID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Запись не найдена (или статус не изменился)"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Статус записи успешно обновлен"})
	}
}

// DELETE /appointments/:id
func cancelAppointmentHandler(db *sql.DB) gin.HandlerFunc {
	// ... (код без изменений) ...
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
		tx, err := db.Begin()
		if err != nil {
			log.Printf("Appointments ERROR: Не удалось начать транзакцию отмены %d: %v", appointmentID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		defer func() {
			if p := recover(); p != nil {
				tx.Rollback()
				panic(p)
			} else if err != nil {
				tx.Rollback()
			}
		}()
		var actualPatientID, scheduleSlotID int
		var currentStatus string
		checkQuery := `SELECT patient_id, doctor_schedule_id, status FROM appointments WHERE id = $1 FOR UPDATE`
		err = tx.QueryRow(checkQuery, appointmentID).Scan(&actualPatientID, &scheduleSlotID, &currentStatus)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				err = errors.New("запись не найдена")
				c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
				return
			}
			log.Printf("Appointments ERROR: Ошибка получения данных записи %d для отмены: %v", appointmentID, err)
			err = errors.New("ошибка сервера")
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		canCancel := false
		if requestUserRole == "admin" {
			canCancel = true
		} else if requestUserRole == "patient" && requestUserID == actualPatientID {
			canCancel = true
		}
		if !canCancel {
			err = errors.New("доступ запрещен")
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		if currentStatus != "scheduled" {
			err = errors.New("можно отменить только запланированную запись")
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		deleteApptQuery := "DELETE FROM appointments WHERE id = $1"
		result, err := tx.Exec(deleteApptQuery, appointmentID)
		if err != nil {
			log.Printf("Appointments ERROR: Ошибка при удалении записи %d: %v", appointmentID, err)
			err = errors.New("ошибка сервера")
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			log.Printf("Appointments WARN: Попытка удаления записи %d не затронула строк.", appointmentID)
			err = errors.New("не удалось удалить запись")
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		updateSlotQuery := "UPDATE doctor_schedules SET is_available = true WHERE id = $1"
		_, err = tx.Exec(updateSlotQuery, scheduleSlotID)
		if err != nil {
			log.Printf("Appointments CRITICAL ERROR: Запись %d удалена, но не удалось освободить слот %d: %v", appointmentID, scheduleSlotID, err)
			err = errors.New("ошибка сервера")
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		err = tx.Commit()
		if err != nil {
			log.Printf("Appointments ERROR: Не удалось подтвердить транзакцию отмены %d: %v", appointmentID, err)
			err = errors.New("ошибка сервера")
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		log.Printf("Appointments INFO: Запись %d удалена пользователем %d (роль %s)", appointmentID, requestUserID, requestUserRole)
		c.Status(http.StatusNoContent)
	}
}

/* --- НОВЫЙ Хендлер для получения ВСЕХ записей (только админ) --- */
func getAllAppointmentsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Middleware adminRequired() уже проверил роль

		// Получаем опциональные фильтры
		patientIDStr := c.Query("patient_id")
		doctorIDStr := c.Query("doctor_id")
		// Можно добавить фильтры по дате, статусу и т.д.

		// Формируем запрос
		args := []interface{}{}
		query := `
            SELECT
                a.id, a.patient_id, a.doctor_schedule_id, a.status, a.created_at,
                ds.date, ds.start_time, ds.end_time,
                doc.id as doctor_id, doc.full_name as doctor_name,
                pat.full_name as patient_name,
                spec.name as specialization_name
            FROM appointments a
            JOIN doctor_schedules ds ON a.doctor_schedule_id = ds.id
            JOIN users doc ON ds.doctor_id = doc.id
            JOIN users pat ON a.patient_id = pat.id
            LEFT JOIN specializations spec ON doc.specialization_id = spec.id
            WHERE 1=1` // Заглушка для удобного добавления AND

		if patientIDStr != "" {
			patientID, err := strconv.Atoi(patientIDStr)
			if err == nil {
				args = append(args, patientID)
				query += fmt.Sprintf(" AND a.patient_id = $%d", len(args))
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат patient_id"})
				return
			}
		}

		if doctorIDStr != "" {
			doctorID, err := strconv.Atoi(doctorIDStr)
			if err == nil {
				args = append(args, doctorID)
				query += fmt.Sprintf(" AND ds.doctor_id = $%d", len(args))
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат doctor_id"})
				return
			}
		}

		query += " ORDER BY ds.date DESC, ds.start_time DESC" // Сортировка

		// Выполняем запрос
		rows, err := db.Query(query, args...)
		if err != nil {
			log.Printf("Appointments ERROR: Ошибка БД (getAllAppointments): %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при получении записей"})
			return
		}
		defer rows.Close()

		// Обрабатываем результат
		appointments := []AppointmentResponse{}
		var specName sql.NullString
		var date time.Time
		var startTime, endTime string
		for rows.Next() {
			var appt AppointmentResponse
			err := rows.Scan(
				&appt.ID, &appt.PatientID, &appt.DoctorScheduleID, &appt.Status, &appt.CreatedAt,
				&date, &startTime, &endTime,
				&appt.DoctorID, &appt.DoctorName, // doctor_id и doctor_name
				&appt.PatientName, // patient_name
				&specName,         // specialization_name
			)
			if err != nil {
				log.Printf("Appointments ERROR: Ошибка сканирования (getAllAppointments): %v", err)
				continue
			}
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
			log.Printf("Appointments ERROR: Ошибка итерации (getAllAppointments): %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при обработке записей"})
			return
		}

		c.JSON(http.StatusOK, appointments)
	}
}
