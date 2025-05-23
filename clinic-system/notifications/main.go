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

type Notification struct {
	ID      int       `json:"id"`
	UserID  int       `json:"user_id" binding:"required"`
	Channel string    `json:"channel" binding:"required"`
	Message string    `json:"message" binding:"required"`
	SentAt  time.Time `json:"sent_at"`
	IsRead  bool      `json:"is_read"`
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
	log.Println("Успешное подключение к БД (Notifications service)!")

	r := gin.Default()

	notifyRoutes := r.Group("/notify")
	{
		notifyRoutes.POST("", createNotificationHandler(db))

		notifyRoutes.GET("", getNotificationsHandler(db))

		notifyRoutes.PATCH("/:id/read", markNotificationAsReadHandler(db))
	}

	port := ":8086"
	log.Printf("Notifications service запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска Notifications service: %v", err)
	}
}

func createNotificationHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {

		var req Notification
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}

		var exists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)", req.UserID).Scan(&exists)
		if err != nil {
			log.Printf("Notifications ERROR: Ошибка проверки user_id %d: %v", req.UserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		if !exists {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Пользователь-получатель с ID %d не найден", req.UserID)})
			return
		}

		query := `INSERT INTO notifications (user_id, channel, message) VALUES ($1, $2, $3) RETURNING id, sent_at, is_read`
		var createdNotification Notification
		createdNotification.UserID = req.UserID
		createdNotification.Channel = req.Channel
		createdNotification.Message = req.Message
		err = db.QueryRow(query, req.UserID, req.Channel, req.Message).Scan(&createdNotification.ID, &createdNotification.SentAt, &createdNotification.IsRead)
		if err != nil {
			log.Printf("Notifications ERROR: Ошибка при создании уведомления для user %d: %v", req.UserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}

		c.JSON(http.StatusCreated, createdNotification)
	}
}

func getNotificationsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestUserID, requestUserRole, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		var rows *sql.Rows
		queryArgs := []interface{}{}
		baseQuery := `SELECT id, user_id, channel, message, sent_at, is_read FROM notifications`
		switch requestUserRole {
		case "patient", "doctor":
			baseQuery += " WHERE user_id = $1"
			queryArgs = append(queryArgs, requestUserID)
		case "admin":
			userIDQuery := c.Query("user_id")
			if userIDQuery != "" {
				filterUserID, errAtoi := strconv.Atoi(userIDQuery)
				if errAtoi == nil {
					baseQuery += " WHERE user_id = $1"
					queryArgs = append(queryArgs, filterUserID)
				} else {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат user_id"})
					return
				}
			}
		default:
			c.JSON(http.StatusForbidden, gin.H{"error": "Неизвестная роль"})
			return
		}
		baseQuery += " ORDER BY is_read ASC, sent_at DESC"
		rows, err = db.Query(baseQuery, queryArgs...)
		if err != nil {
			log.Printf("Notifications ERROR: Ошибка БД: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		defer rows.Close()
		notifications := []Notification{}
		for rows.Next() {
			var n Notification
			if errScan := rows.Scan(&n.ID, &n.UserID, &n.Channel, &n.Message, &n.SentAt, &n.IsRead); errScan != nil {
				log.Printf("Notifications ERROR: Ошибка сканирования: %v", errScan)
				continue
			}
			notifications = append(notifications, n)
		}
		if err = rows.Err(); err != nil {
			log.Printf("Notifications ERROR: Ошибка итерации: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		c.JSON(http.StatusOK, notifications)
	}
}

func markNotificationAsReadHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestUserID, _, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		notificationIDStr := c.Param("id")
		notificationID, err := strconv.Atoi(notificationIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID уведомления"})
			return
		}
		var actualUserID int
		err = db.QueryRow("SELECT user_id FROM notifications WHERE id = $1", notificationID).Scan(&actualUserID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Уведомление не найдено"})
				return
			}
			log.Printf("Notifications ERROR: Ошибка проверки получателя %d: %v", notificationID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		if actualUserID != requestUserID {
			log.Printf("Notifications WARN: User %d пытался пометить чужое уведомление %d (получатель %d)", requestUserID, notificationID, actualUserID)
			c.JSON(http.StatusForbidden, gin.H{"error": "Нельзя помечать чужие уведомления"})
			return
		}
		query := `UPDATE notifications SET is_read = true WHERE id = $1 AND is_read = false`
		result, err := db.Exec(query, notificationID)
		if err != nil {
			log.Printf("Notifications ERROR: Ошибка обновления is_read %d: %v", notificationID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected > 0 {
			c.JSON(http.StatusOK, gin.H{"message": "Уведомление помечено как прочитанное"})
		} else {
			c.JSON(http.StatusOK, gin.H{"message": "Уведомление уже прочитано или не найдено"})
		}
	}
}
