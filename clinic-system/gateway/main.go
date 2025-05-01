package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os" // Возможно, понадобится для SECRET
	"strconv"
	"strings"
	"time" // Добавьте time для JWT

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5" // Добавьте библиотеку JWT
)

// --- JWT Secret (должен совпадать с users service) ---
// В идеале, вычитывается из переменной окружения или конфига
var jwtSecret = []byte(os.Getenv("JWT_SECRET")) // Используем переменную окружения!
// Если переменная не задана, используем дефолтное значение из users service для примера
func init() {
	if len(jwtSecret) == 0 {
		log.Println("WARNING: JWT_SECRET environment variable not set, using default secret.")
		jwtSecret = []byte("supersecret") // Дефолтное значение
	}
}

// --- Функция для извлечения ID пользователя из токена (аналогичная users service) ---
func extractUserIDFromToken(tokenStr string) (int, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return 0, fmt.Errorf("неожиданный метод подписи: %v", t.Header["alg"])
		}
		return jwtSecret, nil
	})
	if err != nil || !token.Valid {
		return 0, errors.New("некорректный или просроченный токен")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, errors.New("неверный формат claims в токене")
	}
	raw, ok := claims["user_id"]
	if !ok {
		return 0, errors.New("user_id не найден в токене")
	}
	idFloat, ok := raw.(float64)
	if !ok {
		return 0, errors.New("user_id в токене не является числом")
	}

	return int(idFloat), nil
}

// --- Функция для получения данных пользователя (включая роль) из Users Service ---
// Выполняет ВНУТРЕННИЙ HTTP запрос к users service
func getUserDataFromUsersService(userID int) (*User, error) {
	// URL Users Service (используем имя сервиса в Docker Compose)
	usersServiceURL := fmt.Sprintf("http://users:8080/users/%d", userID) // Используем новый эндпоинт

	req, err := http.NewRequest("GET", usersServiceURL, nil)
	if err != nil {
		log.Printf("Gateway: Error creating request to users service: %v", err)
		return nil, fmt.Errorf("внутренняя ошибка при запросе к users service")
	}

	// ВАЖНО: Здесь может потребоваться какая-то внутренняя аутентификация для сервисов,
	// например, API Key в заголовке X-Internal-API-Key
	// req.Header.Set("X-Internal-API-Key", os.Getenv("INTERNAL_API_KEY")) // Пример

	client := &http.Client{Timeout: 5 * time.Second} // Таймаут для запроса между сервисами
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Gateway: Error calling users service (%s): %v", usersServiceURL, err)
		return nil, fmt.Errorf("users service недоступен или вернул ошибку")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Если users service вернул не 200 OK (например, 404 Not Found)
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("Gateway: Users service returned status %d for user %d. Body: %s", resp.StatusCode, userID, string(bodyBytes))
		return nil, fmt.Errorf("пользователь не найден или ошибка в users service (статус %d)", resp.StatusCode)
	}

	var user User
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		log.Printf("Gateway: Error decoding user data from users service: %v", err)
		return nil, fmt.Errorf("ошибка декодирования данных пользователя из users service")
	}

	return &user, nil
}

// --- Структура пользователя, которую возвращает Users Service (нужна для декодирования) ---
type User struct {
	ID             int     `json:"id"`
	FullName       string  `json:"full_name"`
	Email          string  `json:"email"`
	Phone          string  `json:"phone"`
	Role           string  `json:"role"` // <-- Самое важное поле для Gateway
	ClinicID       *int    `json:"clinic_id"`
	Specialization *string `json:"specialization,omitempty"`
}

// --- Middleware для аутентификации и добавления заголовков X-User-ID, X-User-Role ---
func AuthAndHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Извлекаем токен из заголовка Authorization
		auth := c.GetHeader("Authorization")
		if auth == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Отсутствует токен аутентификации"})
			c.Abort() // Прерываем дальнейшую обработку
			return
		}
		parts := strings.Fields(auth)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" { // Приводим к нижнему регистру для надежности
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Некорректный формат токена"})
			c.Abort()
			return
		}
		tokenStr := parts[1]

		// 2. Валидируем токен и извлекаем user_id
		userID, err := extractUserIDFromToken(tokenStr)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": fmt.Sprintf("Невалидный токен: %v", err.Error())})
			c.Abort()
			return
		}

		// 3. Получаем данные пользователя (включая роль) из Users Service
		user, err := getUserDataFromUsersService(userID)
		if err != nil {
			// Если не удалось получить данные пользователя, это либо ошибка в users service,
			// либо пользователя с таким ID уже нет (удален).
			c.JSON(http.StatusUnauthorized, gin.H{"error": fmt.Sprintf("Не удалось получить данные пользователя: %v", err.Error())})
			c.Abort()
			return
		}

		// 4. Добавляем проверенные заголовки в запрос, который будет проксирован
		// Удаляем исходный Authorization заголовок (опционально, но хорошая практика)
		c.Request.Header.Del("Authorization")
		// Добавляем наши служебные заголовки
		c.Request.Header.Set("X-User-ID", strconv.Itoa(user.ID))
		c.Request.Header.Set("X-User-Role", user.Role)
		// Можем добавить и другие поля, если нужны в downstream сервисах, например X-User-Clinic-ID

		// 5. Продолжаем обработку запроса (проксирование)
		c.Next()
	}
}

// ---------------------------------------------------------------
// proxy helper: почти без изменений, но теперь он проксирует
// уже измененный c.Request (с добавленными заголовками)
// ---------------------------------------------------------------
func proxy(c *gin.Context, targetBase string) {
	// собираем полный URL: targetBase + original.Path (или части path) + "?" + RawQuery

	// Исправляем логику proxy: targetBase уже должен содержать базовый путь микросервиса
	// А к нему нужно добавить *path часть из маршрута Gateway
	// Например: targetBase = "http://schedules:8082/schedules"
	// В маршруте Gateway: /api/schedules/*proxyPath
	// originalPath = c.Request.URL.Path (например, /api/schedules/my)
	// proxyPathParam = c.Param("proxyPath") (например, /my)

	targetURL := targetBase           // Базовый URL целевого сервиса с его базовым путем
	proxyPathParam := c.Param("path") // Получаем *path часть из маршрута Gateway

	// Убедимся, что targetURL заканчивается на слеш, а proxyPathParam начинается без слеша,
	// чтобы правильно их объединить. Или просто объединяем как есть, если уверены в форматах.
	// Простой вариант:
	finalURL := targetURL + proxyPathParam // Добавляем *path параметр из Gateway маршрута

	// Добавляем query string
	if c.Request.URL.RawQuery != "" {
		finalURL += "?" + c.Request.URL.RawQuery
	}

	req, err := http.NewRequest(c.Request.Method, finalURL, c.Request.Body)
	if err != nil {
		log.Printf("Gateway: Proxy request creation error for %s: %v", finalURL, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка создания прокси-запроса"})
		return
	}

	// Теперь req.Header уже содержит заголовки, добавленные AuthAndHeadersMiddleware (если оно выполнялось)
	// Копируем все заголовки из входящего запроса Gin в новый исходящий запрос
	req.Header = c.Request.Header

	client := &http.Client{} // Используем дефолтный клиент (или настроенный с таймаутами)
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Gateway: Upstream service error (%s): %v", finalURL, err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "целевой сервис недоступен"})
		return
	}
	defer resp.Body.Close()

	// Прокидываем статус и заголовки из ответа целевого сервиса клиенту
	c.Status(resp.StatusCode)
	for k, v := range resp.Header {
		for _, vv := range v {
			c.Writer.Header().Add(k, vv)
		}
	}
	// Прокидываем тело ответа
	_, err = io.Copy(c.Writer, resp.Body)
	if err != nil {
		log.Printf("Gateway: Error copying response body for %s: %v", finalURL, err)
		// В зависимости от политики, можно вернуть 500 или просто завершить соединение
	}
}

func main() {
	r := gin.Default()

	// --- Группа маршрутов, требующих аутентификации ---
	authenticatedRoutes := r.Group("/api")
	{
		// Применяем наше middleware ко всем маршрутам в этой группе
		authenticatedRoutes.Use(AuthAndHeadersMiddleware())

		// ---------- USERS SERVICE (Запросы, требующие токена, вроде /me) -------------
		// Важно: запросы к Users service для получения роли (GET /users/:id)
		// НЕ ДОЛЖНЫ проходить через этот middleware, иначе будет рекурсия.
		// Эндпоинты вроде /login, /register тоже не требуют токена.
		// Эндпоинт /me требует токена.
		// Нужно явно указать, какие маршруты User Service требуют токена и проксировать их,
		// применяя middleware ТОЛЬКО к проксируемым маршрутам ДРУГИХ сервисов.

		// Давайте уберем AuthAndHeadersMiddleware из группы /api
		// и применим его индивидуально к маршрутам, которые должны быть защищены.

		// ---------- CLINICS SERVICE ----------- (Требует аутентификации? Если да, добавить AuthAndHeadersMiddleware)
		// Например, просмотр клиник может быть публичным, а добавление/редактирование - для админов клиники.
		// Пока проксируем без аутентификации, если не указано иное.
		r.Any("/api/clinics", func(c *gin.Context) {
			proxy(c, "http://clinics:8087/clinics") // clinic service слушает на /clinics
		})
		r.Any("/api/clinics/*path", func(c *gin.Context) {
			proxy(c, "http://clinics:8087/clinics") // clinic service слушает на /clinics
		})

		// ---------- SCHEDULES ----------------- (Требует аутентификации для всех операций кроме, возможно, публичного просмотра)
		// Операции добавления/получения/изменения/удаления слотов требуют аутентификации (и авторизации по роли в schedules service)
		schedulesRoutes := r.Group("/api/schedules")
		{
			schedulesRoutes.Use(AuthAndHeadersMiddleware()) // Применяем middleware сюда

			// POST /api/schedules -> проксируется на POST http://schedules:8082/schedules
			// GET /api/schedules/my -> проксируется на GET http://schedules:8082/schedules/my
			// PATCH /api/schedules/:id -> проксируется на PATCH http://schedules:8082/schedules/:id
			// DELETE /api/schedules/:id -> проксируется на DELETE http://schedules:8082/schedules/:id
			schedulesRoutes.Any("/*path", func(c *gin.Context) { // *path покроет "/", "/my", "/:id" и т.д.
				proxy(c, "http://schedules:8082/schedules") // schedules service слушает на /schedules
			})
		}

		// ---------- APPOINTMENTS -------------- (Требует аутентификации)
		appointmentsRoutes := r.Group("/api/appointments")
		{
			appointmentsRoutes.Use(AuthAndHeadersMiddleware()) // Применяем middleware сюда
			appointmentsRoutes.Any("/*path", func(c *gin.Context) {
				proxy(c, "http://appointments:8083/appointments") // Например, appointments service слушает на /appointments
			})
		}

		// ---------- MEDICAL RECORDS ----------- (Требует аутентификации)
		medicalRecordsRoutes := r.Group("/api/medical_records")
		{
			medicalRecordsRoutes.Use(AuthAndHeadersMiddleware()) // Применяем middleware сюда
			medicalRecordsRoutes.Any("/*path", func(c *gin.Context) {
				proxy(c, "http://medical_records:8084/medical_records") // Например, medical_records service слушает на /medical_records
			})
		}

		// ---------- PAYMENTS ------------------ (Требует аутентификации)
		paymentsRoutes := r.Group("/api/payments")
		{
			paymentsRoutes.Use(AuthAndHeadersMiddleware()) // Применяем middleware сюда
			paymentsRoutes.Any("/*path", func(c *gin.Context) {
				proxy(c, "http://payments:8085/payments") // Например, payments service слушает на /payments
			})
		}

		// ---------- NOTIFICATIONS ------------- (Требует аутентификации)
		notificationsRoutes := r.Group("/api/notifications")
		{
			notificationsRoutes.Use(AuthAndHeadersMiddleware()) // Применяем middleware сюда
			notificationsRoutes.Any("/*path", func(c *gin.Context) {
				proxy(c, "http://notifications:8086/notifications") // Например, notifications service слушает на /notifications
			})
		}
	}

	// ---------- USERS SERVICE (публичные и защищенные) -------------
	// Маршруты Users service, которые НЕ требуют AuthAndHeadersMiddleware здесь,
	// потому что они либо публичные (/register, /login), либо сам сервис их аутентифицирует (/me).
	// Запрос к /me содержит токен, users service сам его проверит.
	// Запрос Gateway к users service на /users/:id тоже идет сюда, и он не должен быть защищен токеном клиента.

	// Публичные маршруты users service
	r.POST("/api/register", func(c *gin.Context) { proxy(c, "http://users:8080") }) // users service слушает на /register
	r.POST("/api/login", func(c *gin.Context) { proxy(c, "http://users:8080") })    // users service слушает на /login

	// Маршрут /me users service (требует токена, который проверяет сам users service)
	r.GET("/api/me", func(c *gin.Context) { proxy(c, "http://users:8080") }) // users service слушает на /me

	// !!! Важно: Маршрут Users Service /users/:id, используемый Gateway для получения роли,
	// не должен быть доступен извне Gateway и не должен требовать токена клиента.
	// Если вы хотите проксировать этот маршрут через Gateway (например, для отладки),
	// убедитесь, что он не защищен AuthAndHeadersMiddleware.
	// Если он нужен только Gateway, то Gateway должен обращаться к нему напрямую
	// по внутреннему адресу (http://users:8080/users/:id), минуя собственные маршруты Gateway.
	// Моя функция getUserDataFromUsersService делает именно это.

	log.Println("API-gateway listening on :8000")
	if err := r.Run(":8000"); err != nil {
		log.Fatalf("gateway start error: %v", err)
	}
}
