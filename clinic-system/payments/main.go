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

type Payment struct {
	ID            int       `json:"id"`
	AppointmentID int       `json:"appointment_id" binding:"required"`
	Amount        float64   `json:"amount" binding:"required"`
	PaymentDate   time.Time `json:"payment_date"`
	PaymentStatus string    `json:"payment_status"`
}

type PaymentResponse struct {
	ID            int          `json:"id"`
	AppointmentID int          `json:"appointment_id"`
	Amount        float64      `json:"amount"`
	PaymentDate   sql.NullTime `json:"payment_date"`
	PaymentStatus string       `json:"payment_status"`
	PatientID     *int         `json:"patient_id,omitempty"`
	PatientName   *string      `json:"patient_name,omitempty"`
	DoctorID      *int         `json:"doctor_id,omitempty"`
	DoctorName    *string      `json:"doctor_name,omitempty"`
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
	log.Println("Успешное подключение к БД (Payments service)!")

	r := gin.Default()
	paymentsRoutes := r.Group("/payments")
	{
		paymentsRoutes.POST("", createPaymentHandler(db))
		paymentsRoutes.GET("", getPaymentsHandler(db))
	}

	port := ":8085"
	log.Printf("Payments service запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска Payments service: %v", err)
	}
}

func createPaymentHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestUserID, requestUserRole, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		var req Payment
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}
		if req.AppointmentID <= 0 || req.Amount <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректные значения appointment_id или amount"})
			return
		}

		if requestUserRole == "patient" {
			var actualPatientID int
			checkQuery := "SELECT patient_id FROM appointments WHERE id = $1"
			errCheck := db.QueryRow(checkQuery, req.AppointmentID).Scan(&actualPatientID)
			if errCheck != nil {
				if errors.Is(errCheck, sql.ErrNoRows) {
					c.JSON(http.StatusNotFound, gin.H{"error": "Запись на прием не найдена"})
					return
				}
				log.Printf("Payments ERROR: Ошибка проверки принадлежности записи %d пациенту %d: %v", req.AppointmentID, requestUserID, errCheck)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при проверке записи"})
				return
			}
			if actualPatientID != requestUserID {
				c.JSON(http.StatusForbidden, gin.H{"error": "Вы можете регистрировать оплату только для своих записей"})
				return
			}
		}

		paymentStatus := "paid"
		paymentDate := time.Now()
		query := `INSERT INTO payments (appointment_id, amount, payment_date, payment_status) VALUES ($1, $2, $3, $4) RETURNING id`
		var paymentID int
		err = db.QueryRow(query, req.AppointmentID, req.Amount, paymentDate, paymentStatus).Scan(&paymentID)
		if err != nil {
			if strings.Contains(err.Error(), "payments_appointment_id_key") {
				c.JSON(http.StatusConflict, gin.H{"error": "Платеж для этой записи уже существует"})
				return
			}
			if strings.Contains(err.Error(), "fk_payment_appointment") {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Указанная запись на прием не существует"})
				return
			}
			log.Printf("Payments ERROR: Ошибка при регистрации платежа для appointment %d (user %d): %v", req.AppointmentID, requestUserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}

		resp := Payment{ID: paymentID, AppointmentID: req.AppointmentID, Amount: req.Amount, PaymentDate: paymentDate, PaymentStatus: paymentStatus}
		c.JSON(http.StatusCreated, resp)
	}
}

func getPaymentsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestUserID, requestUserRole, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var rows *sql.Rows
		queryArgs := []interface{}{}
		baseQuery := `SELECT p.id, p.appointment_id, p.amount, p.payment_date, p.payment_status, a.patient_id, pat.full_name as patient_name, ds.doctor_id, doc.full_name as doctor_name
										FROM payments p JOIN appointments a ON p.appointment_id = a.id JOIN doctor_schedules ds ON a.doctor_schedule_id = ds.id
										JOIN users pat ON a.patient_id = pat.id JOIN users doc ON ds.doctor_id = doc.id
										WHERE 1=1`
		switch requestUserRole {
		case "patient":
			baseQuery += " AND a.patient_id = $1"
			queryArgs = append(queryArgs, requestUserID)
		case "doctor":
			baseQuery += " AND ds.doctor_id = $1"
			queryArgs = append(queryArgs, requestUserID)
			patientIDQuery := c.Query("patient_id")
			if patientIDQuery != "" {
				if patientID, err := strconv.Atoi(patientIDQuery); err == nil {
					baseQuery += " AND a.patient_id = $" + strconv.Itoa(len(queryArgs)+1)
					queryArgs = append(queryArgs, patientID)
				} else {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат patient_id"})
					return
				}
			}
		case "admin":
			patientIDQuery := c.Query("patient_id")
			if patientIDQuery != "" {
				if patientID, err := strconv.Atoi(patientIDQuery); err == nil {
					baseQuery += " AND a.patient_id = $" + strconv.Itoa(len(queryArgs)+1)
					queryArgs = append(queryArgs, patientID)
				} else {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат patient_id"})
					return
				}
			}
			doctorIDQuery := c.Query("doctor_id")
			if doctorIDQuery != "" {
				if doctorID, err := strconv.Atoi(doctorIDQuery); err == nil {
					baseQuery += " AND ds.doctor_id = $" + strconv.Itoa(len(queryArgs)+1)
					queryArgs = append(queryArgs, doctorID)
				} else {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат doctor_id"})
					return
				}
			}
		default:
			c.JSON(http.StatusForbidden, gin.H{"error": "Неизвестная роль пользователя"})
			return
		}
		baseQuery += " ORDER BY p.payment_date DESC, p.id DESC"
		rows, err = db.Query(baseQuery, queryArgs...)
		if err != nil {
			log.Printf("Payments ERROR: Ошибка БД при получении платежей: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		defer rows.Close()
		payments := []PaymentResponse{}
		var paymentDate sql.NullTime
		var patientName, doctorName sql.NullString
		var patientID, doctorID sql.NullInt64
		for rows.Next() {
			var p PaymentResponse
			if err := rows.Scan(&p.ID, &p.AppointmentID, &p.Amount, &paymentDate, &p.PaymentStatus, &patientID, &patientName, &doctorID, &doctorName); err != nil {
				log.Printf("Payments ERROR: Ошибка сканирования строки платежа: %v", err)
				continue
			}
			if paymentDate.Valid {
				p.PaymentDate = paymentDate
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
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		c.JSON(http.StatusOK, payments)
	}
}
