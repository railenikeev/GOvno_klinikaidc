package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// --- JWT Secret (должен совпадать с users service) ---
var jwtSecret = []byte(os.Getenv("JWT_SECRET"))

func init() {
	if len(jwtSecret) == 0 {
		log.Println("ПРЕДУПРЕЖДЕНИЕ (Gateway): Переменная окружения JWT_SECRET не установлена, используется значение по умолчанию 'supersecret'.")
		jwtSecret = []byte("supersecret") // Значение по умолчанию
	}
}

// --- Функция для извлечения ID пользователя из токена (аналогичная users service) ---
func extractUserIDFromToken(tokenStr string) (int, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("неожиданный метод подписи: %v", t.Header["alg"])
		}
		return jwtSecret, nil
	})
	if err != nil || !token.Valid {
		// Ошибки парсинга, просроченные токены, неверные подписи
		return 0, errors.New("некорректный или просроченный токен")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, errors.New("неверный формат claims в токене")
	}
	rawUserID, ok := claims["user_id"]
	if !ok {
		return 0, errors.New("user_id не найден в токене")
	}
	userIDFloat, ok := rawUserID.(float64)
	if !ok {
		return 0, errors.New("user_id в токене не является числом")
	}
	return int(userIDFloat), nil
}

// --- Структура пользователя (должна соответствовать ответу от Users Service /users/:id) ---
// Обновлено: убран ClinicID, добавлены SpecializationID и SpecializationName
type User struct {
	ID                 int     `json:"id"`
	FullName           string  `json:"full_name"`
	Email              string  `json:"email"`
	Phone              string  `json:"phone"`
	Role               string  `json:"role"` // Это поле критично для Gateway
	SpecializationID   *int    `json:"specialization_id,omitempty"`
	SpecializationName *string `json:"specialization_name,omitempty"`
	// ClinicID *int `json:"clinic_id"` // Убрано
}

// --- Функция для получения данных пользователя из Users Service ---
func getUserDataFromUsersService(userID int) (*User, error) {
	// URL Users Service (используем имя сервиса в Docker Compose)
	usersServiceURL := fmt.Sprintf("http://users:8080/users/%d", userID)

	// Создаем HTTP клиент с таймаутом
	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest("GET", usersServiceURL, nil)
	if err != nil {
		log.Printf("Gateway: Ошибка создания запроса к users service: %v", err)
		return nil, fmt.Errorf("внутренняя ошибка шлюза")
	}

	// В реальной системе здесь могла бы быть аутентификация между сервисами (API Key и т.п.)
	// req.Header.Set("X-Internal-API-Key", os.Getenv("INTERNAL_API_KEY"))

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Gateway: Ошибка вызова users service (%s): %v", usersServiceURL, err)
		return nil, fmt.Errorf("сервис пользователей недоступен")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body) // Читаем тело ответа для логгирования
		log.Printf("Gateway: Users service вернул статус %d для user %d. Body: %s", resp.StatusCode, userID, string(bodyBytes))
		if resp.StatusCode == http.StatusNotFound {
			return nil, fmt.Errorf("пользователь с ID %d не найден в сервисе пользователей", userID)
		}
		return nil, fmt.Errorf("сервис пользователей вернул ошибку (статус %d)", resp.StatusCode)
	}

	var user User // Используем обновленную локальную структуру User
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		log.Printf("Gateway: Ошибка декодирования данных пользователя из users service: %v", err)
		return nil, fmt.Errorf("ошибка обработки ответа от сервиса пользователей")
	}

	// Проверяем, что получили ожидаемую роль (хотя бы не пустую)
	if user.Role == "" {
		log.Printf("Gateway: Получены неполные данные пользователя (отсутствует роль) для userID %d", userID)
		return nil, fmt.Errorf("не удалось получить роль пользователя")
	}

	return &user, nil
}

// --- Middleware для аутентификации и добавления заголовков ---
func AuthAndHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Отсутствует заголовок Authorization"})
			c.Abort()
			return
		}
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Некорректный формат заголовка Authorization"})
			c.Abort()
			return
		}
		tokenStr := parts[1]

		// Валидируем токен и извлекаем user_id
		userID, err := extractUserIDFromToken(tokenStr)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			c.Abort()
			return
		}

		// Получаем данные пользователя (включая роль) из Users Service
		user, err := getUserDataFromUsersService(userID)
		if err != nil {
			// Ошибка получения данных пользователя (возможно, удален или users service недоступен)
			// Отвечаем 401, так как токен валиден, но пользователь не актуален или сервис недоступен
			c.JSON(http.StatusUnauthorized, gin.H{"error": fmt.Sprintf("Не удалось проверить пользователя: %v", err.Error())})
			c.Abort()
			return
		}

		// Добавляем заголовки X-User-ID и X-User-Role в запрос для проксирования
		// Удаляем исходный Authorization заголовок (хорошая практика)
		c.Request.Header.Del("Authorization")
		// Добавляем наши заголовки
		c.Request.Header.Set("X-User-ID", strconv.Itoa(user.ID))
		c.Request.Header.Set("X-User-Role", user.Role)
		// Можно добавить и другие данные при необходимости, например:
		// if user.SpecializationID != nil {
		// 	c.Request.Header.Set("X-User-Specialization-ID", strconv.Itoa(*user.SpecializationID))
		// }

		c.Next() // Передаем управление дальше (проксированию)
	}
}

// --- Хелпер для проксирования запросов ---
func proxy(c *gin.Context, targetServiceBaseURL string) {
	// targetServiceBaseURL - базовый URL сервиса (например, http://schedules:8082)
	// Нужно добавить к нему запрошенный путь и параметры

	// Формируем URL целевого сервиса
	// c.Request.URL.Path содержит полный путь из запроса к шлюзу (например, /api/schedules/my)
	// Нам нужно отбросить префикс /api и добавить оставшуюся часть к targetServiceBaseURL
	// Используем *path параметр из маршрута Gin для универсальности

	targetPath := c.Param("path") // Получаем часть пути после базового маршрута группы
	finalURL := targetServiceBaseURL + targetPath

	if c.Request.URL.RawQuery != "" {
		finalURL += "?" + c.Request.URL.RawQuery
	}

	// Создаем новый запрос к целевому сервису
	proxyReq, err := http.NewRequest(c.Request.Method, finalURL, c.Request.Body)
	if err != nil {
		log.Printf("Gateway: Ошибка создания прокси-запроса для %s: %v", finalURL, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка шлюза при создании запроса"})
		return
	}

	// Копируем заголовки из оригинального запроса (уже модифицированные middleware)
	proxyReq.Header = c.Request.Header
	// Убедимся, что заголовок Host правильный (либо удаляем, либо ставим нужный)
	proxyReq.Header.Del("Host") // Часто лучше удалить, чтобы http.Client подставил правильный

	// Выполняем запрос
	client := &http.Client{Timeout: 10 * time.Second} // Таймаут для запроса к другому сервису
	resp, err := client.Do(proxyReq)
	if err != nil {
		log.Printf("Gateway: Ошибка при вызове целевого сервиса (%s): %v", finalURL, err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Целевой сервис недоступен или вернул ошибку"})
		return
	}
	defer resp.Body.Close()

	// Копируем статус-код ответа от целевого сервиса клиенту
	c.Status(resp.StatusCode)

	// Копируем заголовки ответа от целевого сервиса клиенту
	for key, values := range resp.Header {
		for _, value := range values {
			// Некоторые заголовки (например, Content-Length) могут быть установлены автоматически io.Copy
			// Пропускаем их или обрабатываем по необходимости
			if key == "Content-Length" { // Gin установит Content-Length сам
				continue
			}
			c.Writer.Header().Add(key, value)
		}
	}

	// Копируем тело ответа от целевого сервиса клиенту
	_, err = io.Copy(c.Writer, resp.Body)
	if err != nil {
		log.Printf("Gateway: Ошибка копирования тела ответа для %s: %v", finalURL, err)
		// Соединение может быть уже закрыто, просто логгируем
	}
}

func main() {
	r := gin.Default()

	// --- Публичные маршруты Users service (не требуют токена) ---
	// Проксируются напрямую без AuthAndHeadersMiddleware
	r.POST("/api/register", func(c *gin.Context) { proxy(c, "http://users:8080/register") }) // Путь к users service может быть просто /register
	r.POST("/api/login", func(c *gin.Context) { proxy(c, "http://users:8080/login") })       // и /login

	// --- Маршрут /me Users service (требует токена, который проверяет сам users service) ---
	// Токен передается "как есть", users service сам его проверит. Middleware шлюза здесь НЕ нужно.
	// Создаем прокси-функцию, которая просто передает запрос дальше
	usersProxyHandler := func(targetPath string) gin.HandlerFunc {
		return func(c *gin.Context) {
			// Важно: передаем путь как есть, без /api префикса
			c.Params = append(c.Params, gin.Param{Key: "path", Value: targetPath}) // Устанавливаем *path параметр для proxy функции
			proxy(c, "http://users:8080")                                          // Проксируем на базовый URL users service
		}
	}
	r.GET("/api/me", usersProxyHandler("/me")) // Маршрут /me

	// --- Группы маршрутов, требующих аутентификации на уровне шлюза ---
	// Применяем AuthAndHeadersMiddleware к этим группам

	// ---------- SCHEDULES SERVICE -----------
	schedulesRoutes := r.Group("/api/schedules")
	schedulesRoutes.Use(AuthAndHeadersMiddleware()) // Защищаем все маршруты расписаний
	{
		// Проксируем все запросы вида /api/schedules/* на http://schedules:8082/*
		schedulesRoutes.Any("/*path", func(c *gin.Context) {
			proxy(c, "http://schedules:8082") // Базовый URL schedules service
		})
	}

	// ---------- APPOINTMENTS SERVICE --------------
	appointmentsRoutes := r.Group("/api/appointments")
	appointmentsRoutes.Use(AuthAndHeadersMiddleware()) // Защищаем
	{
		appointmentsRoutes.Any("/*path", func(c *gin.Context) {
			proxy(c, "http://appointments:8083") // Базовый URL appointments service
		})
	}

	// ---------- MEDICAL RECORDS SERVICE -----------
	medicalRecordsRoutes := r.Group("/api/medical_records")
	medicalRecordsRoutes.Use(AuthAndHeadersMiddleware()) // Защищаем
	{
		medicalRecordsRoutes.Any("/*path", func(c *gin.Context) {
			proxy(c, "http://medical_records:8084") // Базовый URL medical_records service
		})
	}

	// ---------- PAYMENTS SERVICE ------------------
	paymentsRoutes := r.Group("/api/payments")
	paymentsRoutes.Use(AuthAndHeadersMiddleware()) // Защищаем
	{
		paymentsRoutes.Any("/*path", func(c *gin.Context) {
			proxy(c, "http://payments:8085") // Базовый URL payments service
		})
	}

	// ---------- NOTIFICATIONS SERVICE -------------
	notificationsRoutes := r.Group("/api/notifications")
	notificationsRoutes.Use(AuthAndHeadersMiddleware()) // Защищаем
	{
		notificationsRoutes.Any("/*path", func(c *gin.Context) {
			proxy(c, "http://notifications:8086") // Базовый URL notifications service
		})
	}

	// ---------- CLINICS SERVICE (УДАЛЕНО) ----------
	// Маршруты для /api/clinics удалены, так как сервис clinics убран

	// --- Запуск шлюза ---
	port := ":8000" // Порт шлюза
	log.Printf("API Gateway запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска API Gateway: %v", err)
	}
}
