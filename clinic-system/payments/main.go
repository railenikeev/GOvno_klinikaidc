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
	_ "github.com/lib/pq"
)

// Используем тот же хелпер для User Info
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

// Структура для платежа (соответствует таблице payments)
type Payment struct {
	ID            int       `json:"id"`
	AppointmentID int       `json:"appointment_id" binding:"required"` // Обязательно при создании
	Amount        float64   `json:"amount" binding:"required"`         // Обязательно при создании
	PaymentDate   time.Time `json:"payment_date"`                      // Устанавливается при создании
	PaymentStatus string    `json:"payment_status"`                    // Устанавливается при создании ('paid')
}

// Структура для ответа GET /payments (может включать доп. инфо)
type PaymentResponse struct {
	ID            int       `json:"id"`
	AppointmentID int       `json:"appointment_id"`
	Amount        float64   `json:"amount"`
	PaymentDate   time.Time `json:"payment_date"`
	PaymentStatus string    `json:"payment_status"`
	PatientID     *int      `json:"patient_id,omitempty"` // Для информации
	PatientName   *string   `json:"patient_name,omitempty"`
	DoctorID      *int      `json:"doctor_id,omitempty"`
	DoctorName    *string   `json:"doctor_name,omitempty"`
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
	log.Println("Успешное подключение к БД (Payments service)!")

	r := gin.Default()

	// Группа /payments
	paymentsRoutes := r.Group("/payments")
	{
		// POST /payments - Зарегистрировать факт оплаты (только для админа)
		paymentsRoutes.POST("", createPaymentHandler(db))

		// GET /payments - Получить список платежей (с авторизацией по роли)
		paymentsRoutes.GET("", getPaymentsHandler(db))
	}

	port := ":8085"
	log.Printf("Payments service запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска Payments service: %v", err)
	}
}

// --- Обработчики ---

// POST /payments
func createPaymentHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestUserID, requestUserRole, err := getUserInfo(c) // Получаем ID для логгирования, роль для проверки
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		// 1. Авторизация: Только админ может регистрировать оплату
		if requestUserRole != "admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Только администраторы могут регистрировать платежи"})
			return
		}

		// 2. Биндинг JSON
		var req Payment // Используем базовую структуру, но заполним только AppointmentID и Amount
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}
		if req.AppointmentID <= 0 || req.Amount <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректные значения appointment_id или amount"})
			return
		}

		// 3. Вставка в базу данных
		// Устанавливаем статус 'paid' и текущую дату
		paymentStatus := "paid"
		paymentDate := time.Now()

		query := `
            INSERT INTO payments (appointment_id, amount, payment_date, payment_status)
            VALUES ($1, $2, $3, $4)
            RETURNING id`

		var paymentID int
		err = db.QueryRow(query,
			req.AppointmentID, req.Amount, paymentDate, paymentStatus,
		).Scan(&paymentID)

		if err != nil {
			// Проверка на UNIQUE constraint для appointment_id
			if strings.Contains(err.Error(), "duplicate key value violates unique constraint") &&
				strings.Contains(err.Error(), "payments_appointment_id_key") {
				c.JSON(http.StatusConflict, gin.H{"error": "Платеж для этой записи на прием уже существует"})
				return
			}
			// Проверка на нарушение внешнего ключа (если appointment_id не существует)
			if strings.Contains(err.Error(), "violates foreign key constraint") &&
				strings.Contains(err.Error(), "fk_payment_appointment") {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Указанная запись на прием не существует"})
				return
			}
			log.Printf("Payments ERROR: Ошибка при регистрации платежа для appointment %d админом %d: %v", req.AppointmentID, requestUserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при регистрации платежа"})
			return
		}

		// Возвращаем созданный платеж
		resp := Payment{
			ID:            paymentID,
			AppointmentID: req.AppointmentID,
			Amount:        req.Amount,
			PaymentDate:   paymentDate,
			PaymentStatus: paymentStatus,
		}
		c.JSON(http.StatusCreated, resp)
	}
}

// GET /payments
func getPaymentsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestUserID, requestUserRole, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		var rows *sql.Rows
		queryArgs := []interface{}{}

		// Базовый запрос с JOIN'ами для получения доп. информации
		baseQuery := `
            SELECT
                p.id, p.appointment_id, p.amount, p.payment_date, p.payment_status,
                a.patient_id, pat.full_name as patient_name,
                ds.doctor_id, doc.full_name as doctor_name
            FROM payments p
            JOIN appointments a ON p.appointment_id = a.id
            JOIN doctor_schedules ds ON a.doctor_schedule_id = ds.id
            JOIN users pat ON a.patient_id = pat.id
            JOIN users doc ON ds.doctor_id = doc.id
            WHERE 1=1` // Условие-заглушка

		// Фильтрация в зависимости от роли
		switch requestUserRole {
		case "patient":
			// Пациент видит только свои платежи
			baseQuery += " AND a.patient_id = $1"
			queryArgs = append(queryArgs, requestUserID)

		case "doctor":
			// Врач видит платежи по записям к нему
			baseQuery += " AND ds.doctor_id = $1"
			queryArgs = append(queryArgs, requestUserID)
			// Можно добавить фильтр по patient_id из query, если нужно врачу
			patientIDQuery := c.Query("patient_id")
			if patientIDQuery != "" {
				patientID, err := strconv.Atoi(patientIDQuery)
				if err == nil {
					baseQuery += " AND a.patient_id = $" + strconv.Itoa(len(queryArgs)+1)
					queryArgs = append(queryArgs, patientID)
				} else {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат patient_id в query"})
					return
				}
			}

		case "admin":
			// Админ видит все платежи, может фильтровать по patient_id или doctor_id
			patientIDQuery := c.Query("patient_id")
			if patientIDQuery != "" {
				patientID, err := strconv.Atoi(patientIDQuery)
				if err == nil {
					baseQuery += " AND a.patient_id = $" + strconv.Itoa(len(queryArgs)+1)
					queryArgs = append(queryArgs, patientID)
				} else {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат patient_id в query"})
					return
				}
			}
			doctorIDQuery := c.Query("doctor_id")
			if doctorIDQuery != "" {
				doctorID, err := strconv.Atoi(doctorIDQuery)
				if err == nil {
					baseQuery += " AND ds.doctor_id = $" + strconv.Itoa(len(queryArgs)+1)
					queryArgs = append(queryArgs, doctorID)
				} else {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат doctor_id в query"})
					return
				}
			}
			// Без фильтра админ получит все платежи

		default:
			c.JSON(http.StatusForbidden, gin.H{"error": "Неизвестная роль пользователя"})
			return
		}

		// Добавляем сортировку
		baseQuery += " ORDER BY p.payment_date DESC, p.id DESC"

		// Выполняем запрос
		rows, err = db.Query(baseQuery, queryArgs...)
		if err != nil {
			log.Printf("Payments ERROR: Ошибка БД при получении платежей: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при получении платежей"})
			return
		}
		defer rows.Close()

		// Обрабатываем результаты
		payments := []PaymentResponse{}
		for rows.Next() {
			var p PaymentResponse
			var paymentDate sql.NullTime // Для nullable payment_date
			var patientName sql.NullString
			var doctorName sql.NullString
			var patientID sql.NullInt64
			var doctorID sql.NullInt64

			if err := rows.Scan(
				&p.ID, &p.AppointmentID, &p.Amount, &paymentDate, &p.PaymentStatus,
				&patientID, &patientName, &doctorID, &doctorName,
			); err != nil {
				log.Printf("Payments ERROR: Ошибка сканирования строки платежа: %v", err)
				continue
			}

			// Преобразование nullable полей
			if paymentDate.Valid {
				p.PaymentDate = paymentDate.Time
			}
			if patientID.Valid {
				id := int(patientID.Int64)
				p.PatientID = &id
			}
			if patientName.Valid {
				name := patientName.String
				p.PatientName = &name
			}
			if doctorID.Valid {
				id := int(doctorID.Int64)
				p.DoctorID = &id
			}
			if doctorName.Valid {
				name := doctorName.String
				p.DoctorName = &name
			}

			payments = append(payments, p)
		}

		if err = rows.Err(); err != nil {
			log.Printf("Payments ERROR: Ошибка после чтения строк платежей: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при обработке платежей"})
			return
		}

		c.JSON(http.StatusOK, payments)
	}
}
