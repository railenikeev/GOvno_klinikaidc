package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	// Убрали strings, т.к. проверка админа удалена
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

// Структура для уведомления (остается с IsRead)
type Notification struct {
	ID      int       `json:"id"`
	UserID  int       `json:"user_id" binding:"required"` // ID получателя
	Channel string    `json:"channel" binding:"required"` // Канал
	Message string    `json:"message" binding:"required"` // Текст
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
	} // Используем = для err
	log.Println("Успешное подключение к БД (Notifications service)!")

	r := gin.Default()

	notifyRoutes := r.Group("/notify") // Маршрут изменен на /notify для единообразия
	{
		// POST /notify - Создать уведомление (вызывается другими сервисами)
		notifyRoutes.POST("", createNotificationHandler(db))

		// GET /notify - Получить уведомления (с авторизацией по роли, через шлюз)
		notifyRoutes.GET("", getNotificationsHandler(db))

		// PATCH /notify/:id/read - Пометить прочитанным (для получателя, через шлюз)
		notifyRoutes.PATCH("/:id/read", markNotificationAsReadHandler(db))
	}

	port := ":8086"
	log.Printf("Notifications service запущен на порту %s", port)
	// Используем := для новой переменной err
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска Notifications service: %v", err)
	}
}

// --- Обработчики ---

// POST /notify - Создает запись в БД. Вызывается другими сервисами.
func createNotificationHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Проверка роли админа УДАЛЕНА

		var req Notification // Ожидаем UserID, Channel, Message
		// Объявляем err
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}

		// Проверка UserID получателя
		var exists bool
		// Переиспользуем err
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

		// Вставка в базу данных
		query := `INSERT INTO notifications (user_id, channel, message) VALUES ($1, $2, $3) RETURNING id, sent_at, is_read`
		var createdNotification Notification
		createdNotification.UserID = req.UserID
		createdNotification.Channel = req.Channel
		createdNotification.Message = req.Message
		// Переиспользуем err
		err = db.QueryRow(query, req.UserID, req.Channel, req.Message).Scan(&createdNotification.ID, &createdNotification.SentAt, &createdNotification.IsRead)
		if err != nil {
			log.Printf("Notifications ERROR: Ошибка при создании уведомления для user %d: %v", req.UserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}

		c.JSON(http.StatusCreated, createdNotification)
	}
}

// GET /notify - Получает уведомления с фильтрацией по роли (через шлюз)
func getNotificationsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestUserID, requestUserRole, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		} // Объявляем err
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
				filterUserID, errAtoi := strconv.Atoi(userIDQuery) // Локальная errAtoi
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
		// Переиспользуем err
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
			// Объявляем errScan
			if errScan := rows.Scan(&n.ID, &n.UserID, &n.Channel, &n.Message, &n.SentAt, &n.IsRead); errScan != nil {
				log.Printf("Notifications ERROR: Ошибка сканирования: %v", errScan)
				continue
			}
			notifications = append(notifications, n)
		}
		// Переиспользуем err
		if err = rows.Err(); err != nil {
			log.Printf("Notifications ERROR: Ошибка итерации: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
			return
		}
		c.JSON(http.StatusOK, notifications)
	}
}

// PATCH /notify/:id/read - Помечает уведомление прочитанным (через шлюз)
func markNotificationAsReadHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestUserID, _, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		} // Объявляем err
		notificationIDStr := c.Param("id")
		notificationID, err := strconv.Atoi(notificationIDStr) // Переобъявляем err
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID уведомления"})
			return
		}
		var actualUserID int
		// Переиспользуем err
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
		// Переобъявляем err
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
