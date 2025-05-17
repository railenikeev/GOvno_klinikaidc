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

// Структура для ЗАПРОСА на создание медицинской записи
type CreateMedicalRecordRequest struct {
	PatientID     int     `json:"patient_id" binding:"required"`
	DoctorID      int     `json:"doctor_id" binding:"required"`
	AppointmentID int     `json:"appointment_id" binding:"required"`
	Diagnosis     *string `json:"diagnosis"`                     // Nullable
	Treatment     *string `json:"treatment"`                     // Nullable
	VisitDate     string  `json:"visit_date" binding:"required"` // Ожидаем строку "YYYY-MM-DD"
}

// Структура для ОТВЕТА фронтенду (соответствует MedicalRecordEntry на фронте)
type MedicalRecordResponse struct {
	ID            int     `json:"id"`
	PatientID     int     `json:"patient_id"`
	DoctorID      int     `json:"doctor_id"`
	AppointmentID int     `json:"appointment_id"`
	Diagnosis     *string `json:"diagnosis,omitempty"` // omitempty если null
	Treatment     *string `json:"treatment,omitempty"` // omitempty если null
	VisitDate     string  `json:"visit_date"`          // Format YYYY-MM-DD
	PatientName   *string `json:"patient_name,omitempty"`
	DoctorName    *string `json:"doctor_name,omitempty"`
}

// Внутренняя модель для работы с БД, где VisitDate это time.Time
type medicalRecordDBModel struct {
	ID            int
	PatientID     int
	DoctorID      int
	AppointmentID int
	Diagnosis     sql.NullString
	Treatment     sql.NullString
	VisitDate     time.Time
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

	if err = db.Ping(); err != nil { // Используем =, так как err уже объявлен
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
	if errRun := r.Run(port); errRun != nil { // Используем новую переменную errRun
		log.Fatalf("Ошибка запуска Medical Records service: %v", errRun)
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

		if requestUserRole != "doctor" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Только врачи могут создавать медицинские записи"})
			return
		}

		var req CreateMedicalRecordRequest // Используем новую структуру для запроса
		if err := c.ShouldBindJSON(&req); err != nil {
			log.Printf("MedicalRecords BINDING ERROR: %v", err) // Логируем ошибку биндинга
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}

		if req.DoctorID != requestUserID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Врач может создавать записи только для себя (свой doctor_id)"})
			return
		}

		// Парсим VisitDate из строки "YYYY-MM-DD" в time.Time
		visitDateParsed, err := time.Parse("2006-01-02", req.VisitDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат visit_date: %s, ожидается YYYY-MM-DD. Ошибка: %v", req.VisitDate, err)})
			return
		}

		var diagnosisForDb sql.NullString
		if req.Diagnosis != nil && *req.Diagnosis != "" { // Проверяем, что не пустая строка
			diagnosisForDb.String = *req.Diagnosis
			diagnosisForDb.Valid = true
		}

		var treatmentForDb sql.NullString
		if req.Treatment != nil && *req.Treatment != "" { // Проверяем, что не пустая строка
			treatmentForDb.String = *req.Treatment
			treatmentForDb.Valid = true
		}

		query := `
            INSERT INTO medical_records (patient_id, doctor_id, appointment_id, diagnosis, treatment, visit_date)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, patient_id, doctor_id, appointment_id, diagnosis, treatment, visit_date`

		var createdRecordDB medicalRecordDBModel // Используем модель для сканирования из БД

		err = db.QueryRow(query,
			req.PatientID, req.DoctorID, req.AppointmentID, diagnosisForDb, treatmentForDb, visitDateParsed,
		).Scan(
			&createdRecordDB.ID, &createdRecordDB.PatientID, &createdRecordDB.DoctorID, &createdRecordDB.AppointmentID,
			&createdRecordDB.Diagnosis, &createdRecordDB.Treatment, &createdRecordDB.VisitDate,
		)

		if err != nil {
			if strings.Contains(err.Error(), "duplicate key value violates unique constraint") &&
				strings.Contains(err.Error(), "medical_records_appointment_id_key") {
				c.JSON(http.StatusConflict, gin.H{"error": "Медицинская запись для этого приема уже существует"})
				return
			}
			if strings.Contains(err.Error(), "violates foreign key constraint") {
				// Можно добавить более детальную проверку, какой ключ нарушен, если нужно
				c.JSON(http.StatusBadRequest, gin.H{"error": "Указанный пациент, врач или запись на прием не существуют, или прием не принадлежит указанному врачу/пациенту"})
				return
			}
			log.Printf("MedicalRecords ERROR: Ошибка при добавлении записи ЭМК: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при добавлении записи"})
			return
		}

		// Формируем ответ для фронтенда (MedicalRecordResponse)
		responseRecord := MedicalRecordResponse{
			ID:            createdRecordDB.ID,
			PatientID:     createdRecordDB.PatientID,
			DoctorID:      createdRecordDB.DoctorID,
			AppointmentID: createdRecordDB.AppointmentID,
			VisitDate:     createdRecordDB.VisitDate.Format("2006-01-02"),
		}
		if createdRecordDB.Diagnosis.Valid {
			responseRecord.Diagnosis = &createdRecordDB.Diagnosis.String
		}
		if createdRecordDB.Treatment.Valid {
			responseRecord.Treatment = &createdRecordDB.Treatment.String
		}
		// Имена пациента и доктора здесь не получаем при создании,
		// они добавляются при GET запросе через JOIN.
		// Если они нужны в ответе POST, нужно будет сделать доп. запрос или изменить RETURNING.

		c.JSON(http.StatusCreated, responseRecord)
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
		queryArgs := []interface{}{}

		baseQuery := `
            SELECT
                mr.id, mr.patient_id, mr.doctor_id, mr.appointment_id,
                mr.diagnosis, mr.treatment, mr.visit_date,
                p.full_name as patient_name, d.full_name as doctor_name
            FROM medical_records mr
            JOIN users p ON mr.patient_id = p.id
            JOIN users d ON mr.doctor_id = d.id
            WHERE 1=1`

		switch requestUserRole {
		case "patient":
			baseQuery += " AND mr.patient_id = $1"
			queryArgs = append(queryArgs, requestUserID)
		case "doctor":
			baseQuery += " AND mr.doctor_id = $1"
			queryArgs = append(queryArgs, requestUserID)
			patientIDQuery := c.Query("patient_id")
			if patientIDQuery != "" {
				patientID, errAtoi := strconv.Atoi(patientIDQuery) // Локальная переменная errAtoi
				if errAtoi == nil {
					baseQuery += " AND mr.patient_id = $" + strconv.Itoa(len(queryArgs)+1)
					queryArgs = append(queryArgs, patientID)
				} else {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат patient_id в query"})
					return
				}
			}
		case "admin":
			patientIDQuery := c.Query("patient_id")
			if patientIDQuery != "" {
				patientID, errAtoi := strconv.Atoi(patientIDQuery) // Локальная переменная errAtoi
				if errAtoi == nil {
					baseQuery += " AND mr.patient_id = $" + strconv.Itoa(len(queryArgs)+1)
					queryArgs = append(queryArgs, patientID)
				} else {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат patient_id в query"})
					return
				}
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Для администратора необходимо указать patient_id в query параметрах"})
				return
			}
		default:
			c.JSON(http.StatusForbidden, gin.H{"error": "Неизвестная роль пользователя"})
			return
		}

		baseQuery += " ORDER BY mr.visit_date DESC, mr.id DESC" // Добавил mr.id для стабильной сортировки

		rows, err = db.Query(baseQuery, queryArgs...)
		if err != nil {
			log.Printf("MedicalRecords ERROR: Ошибка БД при получении записей ЭМК: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при получении записей"})
			return
		}
		defer rows.Close()

		records := []MedicalRecordResponse{}
		for rows.Next() {
			var rec MedicalRecordResponse
			var visitDate time.Time
			var diagnosis sql.NullString
			var treatment sql.NullString
			var patientName sql.NullString
			var doctorName sql.NullString

			if errScan := rows.Scan( // Локальная переменная errScan
				&rec.ID, &rec.PatientID, &rec.DoctorID, &rec.AppointmentID,
				&diagnosis, &treatment, &visitDate,
				&patientName, &doctorName,
			); errScan != nil {
				log.Printf("MedicalRecords ERROR: Ошибка сканирования строки ЭМК: %v", errScan)
				continue
			}

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
			rec.VisitDate = visitDate.Format("2006-01-02")

			records = append(records, rec)
		}

		if err = rows.Err(); err != nil { // Используем =, так как err уже объявлен
			log.Printf("MedicalRecords ERROR: Ошибка после чтения строк ЭМК: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при обработке записей"})
			return
		}

		if records == nil { // Если цикл не выполнился ни разу
			records = []MedicalRecordResponse{} // Отправляем пустой массив, а не null
		}

		c.JSON(http.StatusOK, records)
	}
}
