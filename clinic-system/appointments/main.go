package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time" // Убедитесь, что импортирован

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

// --- Структуры для API ---
type CreateAppointmentRequest struct {
	DoctorScheduleID int `json:"doctor_schedule_id" binding:"required"`
}

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
	Date               *string   `json:"date,omitempty"`       // YYYY-MM-DD
	StartTime          *string   `json:"start_time,omitempty"` // HH:MM
	EndTime            *string   `json:"end_time,omitempty"`   // HH:MM
}

type UpdateAppointmentStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=scheduled completed cancelled"`
}

type DocumentableAppointmentInfo struct {
	ID        int    `json:"id"`
	Date      string `json:"date"`
	StartTime string `json:"start_time"`
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

	r.POST("", createAppointmentHandler(db))
	r.GET("/my/patient", getMyAppointmentsPatientHandler(db))
	r.GET("/my/doctor", getMyAppointmentsDoctorHandler(db))
	r.PATCH("/:id/status", updateAppointmentStatusHandler(db))
	r.DELETE("/:id", cancelAppointmentHandler(db))
	r.GET("", adminRequired(), getAllAppointmentsHandler(db))
	r.GET("/doctor/for-documentation", getDocumentableAppointmentsHandler(db))

	port := ":8083"
	log.Printf("Appointments service запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска Appointments service: %v", err)
	}
}

// --- Обработчики ---

func createAppointmentHandler(db *sql.DB) gin.HandlerFunc {
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
				_ = tx.Rollback()
				panic(p)
			} else if err != nil {
				_ = tx.Rollback()
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
			// err = errors.New("ошибка сервера") // err уже установлен
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при подтверждении транзакции"})
			return
		}
		c.JSON(http.StatusCreated, createdAppt)
	}
}

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
            SELECT a.id, a.patient_id, a.doctor_schedule_id, a.status, a.created_at,
                   ds.date, ds.start_time, ds.end_time,
                   doc.id as doctor_id, doc.full_name as doctor_name, spec.name as specialization_name
            FROM appointments a
            JOIN doctor_schedules ds ON a.doctor_schedule_id = ds.id
            JOIN users doc ON ds.doctor_id = doc.id
            LEFT JOIN specializations spec ON doc.specialization_id = spec.id
            WHERE a.patient_id = $1
            ORDER BY ds.date DESC, ds.start_time DESC`

		rows, err := db.Query(query, patientID)
		if err != nil {
			log.Printf("Appointments ERROR: Ошибка БД (getMyAppointmentsPatient %d): %v", patientID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		defer rows.Close()

		appointments := []AppointmentResponse{}
		var specName sql.NullString
		var dbDate time.Time
		var dbStartTime, dbEndTime time.Time // ИЗМЕНЕНИЕ: Тип для сканирования

		for rows.Next() {
			var appt AppointmentResponse
			// ИЗМЕНЕНИЕ: Сканируем время в dbStartTime, dbEndTime
			errScan := rows.Scan(
				&appt.ID, &appt.PatientID, &appt.DoctorScheduleID, &appt.Status, &appt.CreatedAt,
				&dbDate, &dbStartTime, &dbEndTime,
				&appt.DoctorID, &appt.DoctorName, &specName,
			)
			if errScan != nil {
				log.Printf("Appointments ERROR: Ошибка сканирования (getMyAppointmentsPatient %d): %v", patientID, errScan)
				continue
			}

			dateStr := dbDate.Format("2006-01-02")
			appt.Date = &dateStr

			// ИЗМЕНЕНИЕ: Форматируем время
			startTimeStr := dbStartTime.Format("15:04")
			endTimeStr := dbEndTime.Format("15:04")
			appt.StartTime = &startTimeStr
			appt.EndTime = &endTimeStr

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
            SELECT a.id, a.patient_id, a.doctor_schedule_id, a.status, a.created_at,
                   ds.date, ds.start_time, ds.end_time,
                   pat.full_name as patient_name
            FROM appointments a
            JOIN doctor_schedules ds ON a.doctor_schedule_id = ds.id
            JOIN users pat ON a.patient_id = pat.id
            WHERE ds.doctor_id = $1
            ORDER BY ds.date DESC, ds.start_time DESC`

		rows, err := db.Query(query, doctorID)
		if err != nil {
			log.Printf("Appointments ERROR: Ошибка БД (getMyAppointmentsDoctor %d): %v", doctorID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		defer rows.Close()

		appointments := []AppointmentResponse{}
		var dbDate time.Time
		var dbStartTime, dbEndTime time.Time // ИЗМЕНЕНИЕ: Тип для сканирования

		for rows.Next() {
			var appt AppointmentResponse
			// ИЗМЕНЕНИЕ: Сканируем время в dbStartTime, dbEndTime
			errScan := rows.Scan(
				&appt.ID, &appt.PatientID, &appt.DoctorScheduleID, &appt.Status, &appt.CreatedAt,
				&dbDate, &dbStartTime, &dbEndTime,
				&appt.PatientName,
			)
			if errScan != nil {
				log.Printf("Appointments ERROR: Ошибка сканирования (getMyAppointmentsDoctor %d): %v", doctorID, errScan)
				continue
			}
			dateStr := dbDate.Format("2006-01-02")
			appt.Date = &dateStr

			// ИЗМЕНЕНИЕ: Форматируем время
			startTimeStr := dbStartTime.Format("15:04")
			endTimeStr := dbEndTime.Format("15:04")
			appt.StartTime = &startTimeStr
			appt.EndTime = &endTimeStr

			appt.DoctorID = &doctorID // Устанавливаем ID текущего доктора
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
			// Это может случиться, если запись не найдена ИЛИ если новый статус такой же, как старый.
			// Для большей точности можно было бы сначала выбрать текущий статус.
			c.JSON(http.StatusNotFound, gin.H{"error": "Запись не найдена или статус не изменился"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Статус записи успешно обновлен"})
	}
}

func cancelAppointmentHandler(db *sql.DB) gin.HandlerFunc {
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
				_ = tx.Rollback()
				panic(p)
			} else if err != nil {
				_ = tx.Rollback()
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
			// Ошибка уже установлена, просто возвращаем
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		updateSlotQuery := "UPDATE doctor_schedules SET is_available = true WHERE id = $1"
		_, err = tx.Exec(updateSlotQuery, scheduleSlotID)
		if err != nil {
			log.Printf("Appointments CRITICAL ERROR: Запись %d удалена, но не удалось освободить слот %d: %v", appointmentID, scheduleSlotID, err)
			// err = errors.New("ошибка сервера") // Ошибка уже установлена
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Критическая ошибка сервера при отмене записи"})
			return
		}
		err = tx.Commit()
		if err != nil {
			log.Printf("Appointments ERROR: Не удалось подтвердить транзакцию отмены %d: %v", appointmentID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при подтверждении отмены"})
			return
		}
		log.Printf("Appointments INFO: Запись %d удалена пользователем %d (роль %s)", appointmentID, requestUserID, requestUserRole)
		c.Status(http.StatusNoContent)
	}
}

func getAllAppointmentsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		patientIDStr := c.Query("patient_id")
		doctorIDStr := c.Query("doctor_id")
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
            WHERE 1=1`
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
		query += " ORDER BY ds.date DESC, ds.start_time DESC"
		rows, err := db.Query(query, args...)
		if err != nil {
			log.Printf("Appointments ERROR: Ошибка БД (getAllAppointments): %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при получении записей"})
			return
		}
		defer rows.Close()

		appointmentsResult := []AppointmentResponse{} // Изменено имя переменной
		var specName sql.NullString
		var dbDate time.Time
		var dbStartTime, dbEndTime time.Time // ИЗМЕНЕНИЕ: Тип для сканирования

		for rows.Next() {
			var appt AppointmentResponse
			// ИЗМЕНЕНИЕ: Сканируем время в dbStartTime, dbEndTime
			errScan := rows.Scan(
				&appt.ID, &appt.PatientID, &appt.DoctorScheduleID, &appt.Status, &appt.CreatedAt,
				&dbDate, &dbStartTime, &dbEndTime,
				&appt.DoctorID, &appt.DoctorName,
				&appt.PatientName,
				&specName,
			)
			if errScan != nil {
				log.Printf("Appointments ERROR: Ошибка сканирования (getAllAppointments): %v", errScan)
				continue
			}
			dateStr := dbDate.Format("2006-01-02")
			appt.Date = &dateStr

			// ИЗМЕНЕНИЕ: Форматируем время
			startTimeStr := dbStartTime.Format("15:04")
			endTimeStr := dbEndTime.Format("15:04")
			appt.StartTime = &startTimeStr
			appt.EndTime = &endTimeStr

			if specName.Valid {
				name := specName.String
				appt.SpecializationName = &name
			}
			appointmentsResult = append(appointmentsResult, appt) // Используем новое имя
		}
		if err = rows.Err(); err != nil {
			log.Printf("Appointments ERROR: Ошибка итерации (getAllAppointments): %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при обработке записей"})
			return
		}
		c.JSON(http.StatusOK, appointmentsResult) // Используем новое имя
	}
}

func getDocumentableAppointmentsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		doctorID, userRole, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		if userRole != "doctor" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Доступ разрешен только врачам"})
			return
		}
		patientIDStr := c.Query("patient_id")
		if patientIDStr == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Необходимо указать patient_id"})
			return
		}
		patientID, err := strconv.Atoi(patientIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат patient_id"})
			return
		}
		query := `
            SELECT a.id, ds.date, ds.start_time
            FROM appointments a
            JOIN doctor_schedules ds ON a.doctor_schedule_id = ds.id
            LEFT JOIN medical_records mr ON a.id = mr.appointment_id
            WHERE ds.doctor_id = $1
              AND a.patient_id = $2
              AND a.status = 'completed'
              AND mr.appointment_id IS NULL
            ORDER BY ds.date DESC, ds.start_time DESC;`

		rows, err := db.Query(query, doctorID, patientID)
		if err != nil {
			log.Printf("Appointments ERROR: Ошибка БД (getDocumentableAppointments для doctor %d, patient %d): %v", doctorID, patientID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при получении списка приемов"})
			return
		}
		defer rows.Close()

		var resultAppointments []DocumentableAppointmentInfo // Изменено имя
		for rows.Next() {
			var apptInfo DocumentableAppointmentInfo
			var dbDate time.Time
			var dbStartTime time.Time // ИЗМЕНЕНИЕ: Тип для сканирования
			// ИЗМЕНЕНИЕ: Сканируем время в dbStartTime
			errScan := rows.Scan(&apptInfo.ID, &dbDate, &dbStartTime)
			if errScan != nil {
				log.Printf("Appointments ERROR: Ошибка сканирования (getDocumentableAppointments): %v", errScan)
				continue
			}
			apptInfo.Date = dbDate.Format("2006-01-02")
			// ИЗМЕНЕНИЕ: Форматируем время
			apptInfo.StartTime = dbStartTime.Format("15:04")
			resultAppointments = append(resultAppointments, apptInfo) // Используем новое имя
		}
		if err = rows.Err(); err != nil {
			log.Printf("Appointments ERROR: Ошибка итерации (getDocumentableAppointments): %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при обработке списка приемов"})
			return
		}
		if resultAppointments == nil {
			resultAppointments = []DocumentableAppointmentInfo{}
		}
		c.JSON(http.StatusOK, resultAppointments) // Используем новое имя
	}
}
