package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings" // Добавим для проверки ошибок
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

// Используем ту же функцию для получения User Info, что и в appointments
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

// Структура для медицинской записи (соответствует таблице)
type MedicalRecord struct {
	ID            int       `json:"id"`
	PatientID     int       `json:"patient_id" binding:"required"`     // Обязательно при создании
	DoctorID      int       `json:"doctor_id" binding:"required"`      // Обязательно при создании
	AppointmentID int       `json:"appointment_id" binding:"required"` // Обязательно при создании
	Diagnosis     *string   `json:"diagnosis"`                         // Nullable
	Treatment     *string   `json:"treatment"`                         // Nullable
	VisitDate     time.Time `json:"visit_date" binding:"required"`     // Дата визита обязательна
}

// Структура для ответа GET /records (может включать доп. поля)
type MedicalRecordResponse struct {
	ID            int     `json:"id"`
	PatientID     int     `json:"patient_id"`
	DoctorID      int     `json:"doctor_id"`
	AppointmentID int     `json:"appointment_id"`
	Diagnosis     *string `json:"diagnosis"`
	Treatment     *string `json:"treatment"`
	VisitDate     string  `json:"visit_date"` // Format YYYY-MM-DD
	PatientName   *string `json:"patient_name,omitempty"`
	DoctorName    *string `json:"doctor_name,omitempty"`
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
	log.Println("Успешное подключение к БД (Medical Records service)!")

	r := gin.Default()

	// Группа /records
	recordsRoutes := r.Group("/records")
	{
		// POST /records - Создать новую запись ЭМК (только для врача)
		recordsRoutes.POST("", createMedicalRecordHandler(db))

		// GET /records - Получить список записей ЭМК (с авторизацией по роли)
		recordsRoutes.GET("", getMedicalRecordsHandler(db))
	}

	port := ":8084"
	log.Printf("Medical Records service запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска Medical Records service: %v", err)
	}
}

// --- Обработчики ---

// POST /records
func createMedicalRecordHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestUserID, requestUserRole, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		// 1. Авторизация: Только врач может создавать запись
		if requestUserRole != "doctor" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Только врачи могут создавать медицинские записи"})
			return
		}

		// 2. Биндинг и базовая валидация JSON
		var rec MedicalRecord
		if err := c.ShouldBindJSON(&rec); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}

		// 3. Проверка логики: Врач создает запись только от своего имени
		if rec.DoctorID != requestUserID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Врач может создавать записи только для себя (свой doctor_id)"})
			return
		}

		// 4. Дополнительная валидация (опционально, но рекомендуется):
		//    - Проверить, существует ли appointment_id
		//    - Проверить, принадлежит ли этот appointment_id этому врачу и пациенту
		//    - Проверить, статус appointment_id (например, 'completed')
		//    - Проверить, нет ли уже записи для этого appointment_id (из-за UNIQUE constraint)
		//    Пропустим эти проверки для упрощения, но в реальной системе они важны.

		// 5. Вставка в базу данных
		query := `
            INSERT INTO medical_records (patient_id, doctor_id, appointment_id, diagnosis, treatment, visit_date)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id`

		err = db.QueryRow(query,
			rec.PatientID, rec.DoctorID, rec.AppointmentID, rec.Diagnosis, rec.Treatment, rec.VisitDate,
		).Scan(&rec.ID)

		if err != nil {
			// Проверка на UNIQUE constraint для appointment_id
			if strings.Contains(err.Error(), "duplicate key value violates unique constraint") &&
				strings.Contains(err.Error(), "medical_records_appointment_id_key") {
				c.JSON(http.StatusConflict, gin.H{"error": "Медицинская запись для этого приема уже существует"})
				return
			}
			// Проверка на нарушение внешних ключей (если appointment_id, patient_id или doctor_id не существуют)
			if strings.Contains(err.Error(), "violates foreign key constraint") {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Указанный пациент, врач или запись на прием не существуют"})
				return
			}
			log.Printf("MedicalRecords ERROR: Ошибка при добавлении записи ЭМК: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при добавлении записи"})
			return
		}

		// Возвращаем созданную запись (без дополнительных полей)
		c.JSON(http.StatusCreated, rec)
	}
}

// GET /records
func getMedicalRecordsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestUserID, requestUserRole, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		var rows *sql.Rows
		var queryArgs []interface{}

		// Базовый запрос с JOIN'ами для получения имен
		baseQuery := `
            SELECT
                mr.id, mr.patient_id, mr.doctor_id, mr.appointment_id,
                mr.diagnosis, mr.treatment, mr.visit_date,
                p.full_name as patient_name, d.full_name as doctor_name
            FROM medical_records mr
            JOIN users p ON mr.patient_id = p.id
            JOIN users d ON mr.doctor_id = d.id
            WHERE 1=1` // Условие-заглушка, к которому будем добавлять фильтры

		// Фильтрация в зависимости от роли
		switch requestUserRole {
		case "patient":
			// Пациент видит только свои записи
			baseQuery += " AND mr.patient_id = $1"
			queryArgs = append(queryArgs, requestUserID)

		case "doctor":
			// Врач видит записи, где он указан как врач
			baseQuery += " AND mr.doctor_id = $1"
			queryArgs = append(queryArgs, requestUserID)
			// Врач может дополнительно фильтровать по ID пациента из query string
			patientIDQuery := c.Query("patient_id")
			if patientIDQuery != "" {
				patientID, err := strconv.Atoi(patientIDQuery)
				if err == nil {
					baseQuery += " AND mr.patient_id = $" + strconv.Itoa(len(queryArgs)+1)
					queryArgs = append(queryArgs, patientID)
				} else {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат patient_id в query"})
					return
				}
			}

		case "admin":
			// Админ может фильтровать по ID пациента из query string
			patientIDQuery := c.Query("patient_id")
			if patientIDQuery != "" {
				patientID, err := strconv.Atoi(patientIDQuery)
				if err == nil {
					baseQuery += " AND mr.patient_id = $" + strconv.Itoa(len(queryArgs)+1)
					queryArgs = append(queryArgs, patientID)
				} else {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат patient_id в query"})
					return
				}
			} else {
				// Запретим админу получать ВСЕ записи без фильтра (слишком много данных)
				c.JSON(http.StatusBadRequest, gin.H{"error": "Для администратора необходимо указать patient_id в query параметрах"})
				return
			}

		default:
			// Неизвестная роль (не должно случиться, если Gateway работает)
			c.JSON(http.StatusForbidden, gin.H{"error": "Неизвестная роль пользователя"})
			return
		}

		// Добавляем сортировку
		baseQuery += " ORDER BY mr.visit_date DESC"

		// Выполняем запрос
		rows, err = db.Query(baseQuery, queryArgs...)
		if err != nil {
			log.Printf("MedicalRecords ERROR: Ошибка БД при получении записей ЭМК: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при получении записей"})
			return
		}
		defer rows.Close()

		// Обрабатываем результаты
		records := []MedicalRecordResponse{}
		for rows.Next() {
			var rec MedicalRecordResponse
			var visitDate time.Time // Сканируем в time.Time
			var diagnosis sql.NullString
			var treatment sql.NullString
			var patientName sql.NullString
			var doctorName sql.NullString

			if err := rows.Scan(
				&rec.ID, &rec.PatientID, &rec.DoctorID, &rec.AppointmentID,
				&diagnosis, &treatment, &visitDate,
				&patientName, &doctorName,
			); err != nil {
				log.Printf("MedicalRecords ERROR: Ошибка сканирования строки ЭМК: %v", err)
				continue
			}

			// Преобразование nullable полей и даты
			if diagnosis.Valid {
				rec.Diagnosis = &diagnosis.String
			}
			if treatment.Valid {
				rec.Treatment = &treatment.String
			}
			if patientName.Valid {
				rec.PatientName = &patientName.String
			}
			if doctorName.Valid {
				rec.DoctorName = &doctorName.String
			}
			dateStr := visitDate.Format("2006-01-02")
			rec.VisitDate = dateStr // Сохраняем дату как строку YYYY-MM-DD

			records = append(records, rec)
		}

		if err = rows.Err(); err != nil {
			log.Printf("MedicalRecords ERROR: Ошибка после чтения строк ЭМК: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при обработке записей"})
			return
		}

		c.JSON(http.StatusOK, records)
	}
}
