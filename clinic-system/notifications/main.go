package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	_ "strings"
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

// Структура для уведомления (добавлено IsRead)
type Notification struct {
	ID      int       `json:"id"`
	UserID  int       `json:"user_id" binding:"required"` // ID получателя (при создании)
	Channel string    `json:"channel" binding:"required"` // Канал (при создании)
	Message string    `json:"message" binding:"required"` // Текст (при создании)
	SentAt  time.Time `json:"sent_at"`                    // Время создания/отправки
	IsRead  bool      `json:"is_read"`                    // Прочитано ли (добавлено)
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
	log.Println("Успешное подключение к БД (Notifications service)!")

	r := gin.Default()

	// Группа /notify
	notifyRoutes := r.Group("/notify") // Маршрут изменен на /notify для единообразия
	{
		// POST /notify - Создать уведомление (только для админа)
		notifyRoutes.POST("", createNotificationHandler(db))

		// GET /notify - Получить уведомления (с авторизацией по роли)
		notifyRoutes.GET("", getNotificationsHandler(db))

		// PATCH /notify/:id/read - Пометить уведомление как прочитанное (для получателя)
		notifyRoutes.PATCH("/:id/read", markNotificationAsReadHandler(db))
	}

	port := ":8086"
	log.Printf("Notifications service запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска Notifications service: %v", err)
	}
}

// --- Обработчики ---

// POST /notify
func createNotificationHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestUserID, requestUserRole, err := getUserInfo(c) // ID админа для логгирования
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		// 1. Авторизация: Только админ может создавать уведомления через этот API
		if requestUserRole != "admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Только администраторы могут создавать уведомления"})
			return
		}

		// 2. Биндинг JSON
		var req Notification // Ожидаем UserID, Channel, Message
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}

		// 3. Проверка существования UserID получателя (опционально, но хорошо)
		var exists bool
		err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)", req.UserID).Scan(&exists)
		if err != nil {
			log.Printf("Notifications ERROR: Ошибка проверки user_id %d: %v", req.UserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при проверке пользователя"})
			return
		}
		if !exists {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Пользователь с ID %d не найден", req.UserID)})
			return
		}

		// 4. Вставка в базу данных (is_read по умолчанию false, sent_at по умолчанию NOW())
		query := `
            INSERT INTO notifications (user_id, channel, message)
            VALUES ($1, $2, $3)
            RETURNING id, sent_at, is_read` // Возвращаем сгенерированные значения

		var createdNotification Notification
		createdNotification.UserID = req.UserID
		createdNotification.Channel = req.Channel
		createdNotification.Message = req.Message

		err = db.QueryRow(query, req.UserID, req.Channel, req.Message).
			Scan(&createdNotification.ID, &createdNotification.SentAt, &createdNotification.IsRead)

		if err != nil {
			// Внешний ключ user_id мы уже проверили выше
			log.Printf("Notifications ERROR: Ошибка при создании уведомления админом %d для user %d: %v", requestUserID, req.UserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при создании уведомления"})
			return
		}

		c.JSON(http.StatusCreated, createdNotification)
	}
}

// GET /notify
func getNotificationsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestUserID, requestUserRole, err := getUserInfo(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		var rows *sql.Rows
		queryArgs := []interface{}{}

		// Базовый запрос
		// Добавлено поле is_read
		baseQuery := `
            SELECT id, user_id, channel, message, sent_at, is_read
            FROM notifications`

		// Фильтрация
		switch requestUserRole {
		case "patient", "doctor":
			// Пациент и врач видят только свои уведомления
			baseQuery += " WHERE user_id = $1"
			queryArgs = append(queryArgs, requestUserID)
		case "admin":
			// Админ видит все. Можно добавить фильтр по user_id query param?
			userIDQuery := c.Query("user_id")
			if userIDQuery != "" {
				filterUserID, err := strconv.Atoi(userIDQuery)
				if err == nil {
					baseQuery += " WHERE user_id = $1"
					queryArgs = append(queryArgs, filterUserID)
				} else {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат user_id в query"})
					return
				}
			}
			// Если фильтра нет, админ получит все

		default:
			c.JSON(http.StatusForbidden, gin.H{"error": "Неизвестная роль пользователя"})
			return
		}

		// Сортировка: сначала непрочитанные, потом по дате убывания
		baseQuery += " ORDER BY is_read ASC, sent_at DESC"

		// Выполняем запрос
		rows, err = db.Query(baseQuery, queryArgs...)
		if err != nil {
			log.Printf("Notifications ERROR: Ошибка БД при получении уведомлений: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при получении уведомлений"})
			return
		}
		defer rows.Close()

		// Обрабатываем результаты
		notifications := []Notification{}
		for rows.Next() {
			var n Notification
			if err := rows.Scan(&n.ID, &n.UserID, &n.Channel, &n.Message, &n.SentAt, &n.IsRead); err != nil {
				log.Printf("Notifications ERROR: Ошибка сканирования строки уведомления: %v", err)
				continue
			}
			notifications = append(notifications, n)
		}

		if err = rows.Err(); err != nil {
			log.Printf("Notifications ERROR: Ошибка после чтения строк уведомлений: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при обработке уведомлений"})
			return
		}

		c.JSON(http.StatusOK, notifications)
	}
}

// PATCH /notify/:id/read
func markNotificationAsReadHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestUserID, requestUserRole, err := getUserInfo(c) // Нужен ID пользователя, чтобы проверить права
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

		// --- Проверка прав: уведомление может пометить прочитанным только его получатель ---
		var actualUserID int
		err = db.QueryRow("SELECT user_id FROM notifications WHERE id = $1", notificationID).Scan(&actualUserID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Уведомление не найдено"})
				return
			}
			log.Printf("Notifications ERROR: Ошибка при проверке получателя уведомления %d: %v", notificationID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при проверке уведомления"})
			return
		}

		if actualUserID != requestUserID {
			log.Printf("Notifications WARN: Пользователь %d (роль %s) пытался пометить прочитанным чужое уведомление %d (получатель %d)", requestUserID, requestUserRole, notificationID, actualUserID)
			c.JSON(http.StatusForbidden, gin.H{"error": "Вы можете пометить прочитанными только свои уведомления"})
			return
		}
		// --- Конец проверки прав ---

		// Обновляем статус is_read на true
		query := `UPDATE notifications SET is_read = true WHERE id = $1 AND is_read = false` // Обновляем только если еще не прочитано
		result, err := db.Exec(query, notificationID)
		if err != nil {
			log.Printf("Notifications ERROR: Ошибка при обновлении статуса is_read для уведомления %d: %v", notificationID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера при обновлении уведомления"})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected > 0 {
			c.JSON(http.StatusOK, gin.H{"message": "Уведомление помечено как прочитанное"})
		} else {
			// Либо не найдено (хотя мы проверяли), либо уже было прочитано
			c.JSON(http.StatusOK, gin.H{"message": "Уведомление уже было прочитано или не найдено"})
		}
	}
}
