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

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

var jwtSecret = []byte(os.Getenv("JWT_SECRET"))

func init() {
	if len(jwtSecret) == 0 {
		log.Println("ПРЕДУПРЕЖДЕНИЕ (Gateway): JWT_SECRET не установлена, используется 'supersecret'.")
		jwtSecret = []byte("supersecret")
	}
}

func extractUserIDFromToken(tokenStr string) (int, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("неожиданный метод подписи: %v", t.Header["alg"])
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

type User struct {
	ID                 int     `json:"id"`
	FullName           string  `json:"full_name"`
	Email              string  `json:"email"`
	Phone              string  `json:"phone"`
	Role               string  `json:"role"`
	SpecializationID   *int    `json:"specialization_id,omitempty"`
	SpecializationName *string `json:"specialization_name,omitempty"`
}

func getUserDataFromUsersService(userID int) (*User, error) {
	usersServiceURL := fmt.Sprintf("http://users:8080/users/%d", userID) // Сервис users на порту 8080
	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest("GET", usersServiceURL, nil)
	if err != nil {
		log.Printf("Gateway: Ошибка создания запроса к users: %v", err)
		return nil, fmt.Errorf("внутренняя ошибка шлюза")
	}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Gateway: Ошибка вызова users (%s): %v", usersServiceURL, err)
		return nil, fmt.Errorf("сервис пользователей недоступен")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("Gateway: Users service status %d for user %d. Body: %s", resp.StatusCode, userID, string(bodyBytes))
		if resp.StatusCode == http.StatusNotFound {
			return nil, fmt.Errorf("пользователь %d не найден", userID)
		}
		return nil, fmt.Errorf("ошибка сервиса пользователей (%d)", resp.StatusCode)
	}
	var user User
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		log.Printf("Gateway: Ошибка декодирования user: %v", err)
		return nil, fmt.Errorf("ошибка ответа сервиса пользователей")
	}
	if user.Role == "" {
		log.Printf("Gateway: Отсутствует роль для userID %d", userID)
		return nil, fmt.Errorf("не удалось получить роль")
	}
	return &user, nil
}

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
		userID, err := extractUserIDFromToken(parts[1])
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			c.Abort()
			return
		}
		user, err := getUserDataFromUsersService(userID)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": fmt.Sprintf("Не удалось проверить пользователя: %v", err.Error())})
			c.Abort()
			return
		}
		// Удаляем оригинальный Authorization, чтобы он не дошел до микросервисов
		c.Request.Header.Del("Authorization")
		// Устанавливаем заголовки с информацией о пользователе
		c.Request.Header.Set("X-User-ID", strconv.Itoa(user.ID))
		c.Request.Header.Set("X-User-Role", user.Role)
		log.Printf("[Gateway AuthMiddleware] User %d (%s) authenticated. Forwarding request.", user.ID, user.Role)
		c.Next()
	}
}

// Обновленная функция proxy
func proxy(c *gin.Context, targetServiceBaseURL string) {
	// c.Param("path") используется для маршрутов с *path или именованными параметрами (:param)
	pathParam := c.Param("path")

	log.Printf("[Gateway Proxy] Original Request URL: %s, Method: %s, c.Param(\"path\"): '%s', Target Base: %s",
		c.Request.URL.Path, c.Request.Method, pathParam, targetServiceBaseURL)

	var finalPathPart string
	if pathParam == "" {
		// Если pathParam пустой (например, для authGroup.POST("/schedules", ...) где нет *path,
		// или для authGroup.GET("/notify", ...) где мы искусственно установили path=""),
		// то мы хотим вызвать корень целевого сервиса.
		finalPathPart = "/"
	} else if !strings.HasPrefix(pathParam, "/") {
		// Если pathParam не пустой и не начинается со слэша (например, "my" или "doctor/1"), добавляем слэш.
		finalPathPart = "/" + pathParam
	} else {
		// Если pathParam уже начинается со слэша (например, "/my" или "/doctor/1"), используем как есть.
		finalPathPart = pathParam
	}

	cleanTargetServiceBaseURL := strings.TrimSuffix(targetServiceBaseURL, "/")
	fullPathToService := cleanTargetServiceBaseURL + finalPathPart

	finalURL := fullPathToService
	if c.Request.URL.RawQuery != "" {
		finalURL += "?" + c.Request.URL.RawQuery
	}

	log.Printf("[Gateway Proxy] Forwarding to: %s %s", c.Request.Method, finalURL)

	proxyReq, err := http.NewRequest(c.Request.Method, finalURL, c.Request.Body)
	if err != nil {
		log.Printf("[Gateway Proxy] Error creating new request to %s: %v", finalURL, err)
		if !c.Writer.Written() {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка шлюза при создании внутреннего запроса"})
		}
		return
	}

	proxyReq.Header = make(http.Header)
	for h, val := range c.Request.Header {
		if strings.EqualFold(h, "Host") || strings.EqualFold(h, "Content-Length") || strings.EqualFold(h, "Connection") {
			continue
		}
		proxyReq.Header[h] = val
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(proxyReq)
	if err != nil {
		log.Printf("[Gateway Proxy] Error during request to upstream service %s: %v", finalURL, err)
		if !c.Writer.Written() {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Сервис (" + strings.TrimPrefix(targetServiceBaseURL, "http://") + ") недоступен или вернул ошибку"})
		}
		return
	}
	defer resp.Body.Close()

	log.Printf("[Gateway Proxy] Response from %s: Status %d", finalURL, resp.StatusCode)

	c.Status(resp.StatusCode)

	for key, values := range resp.Header {
		if strings.EqualFold(key, "Content-Length") || strings.EqualFold(key, "Transfer-Encoding") {
			continue
		}
		for _, value := range values {
			c.Writer.Header().Add(key, value)
		}
	}

	_, copyErr := io.Copy(c.Writer, resp.Body)
	if copyErr != nil {
		log.Printf("[Gateway Proxy] Error copying response body from %s: %v", finalURL, copyErr)
	}
}

// Обертка для usersProxyHandler, чтобы не менять c.Params напрямую в каждом хендлере
func makeUsersProxyHandler(servicePath string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// pathParam будет тем, что после /api/users/ или /api/specializations/
		// или пустой для /api/users или /api/specializations
		pathSuffix := c.Param("path") // Это для *path маршрутов

		// Формируем полный путь для сервиса users
		// servicePath - это, например, "/users", "/specializations", "/register", "/login", "/me"
		// pathSuffix - это, например, "/1" или ""
		fullServicePath := servicePath + pathSuffix

		// Передаем этот полный путь как "path" параметр для функции proxy
		currentParams := c.Params
		c.Params = gin.Params{gin.Param{Key: "path", Value: fullServicePath}}
		proxy(c, "http://users:8080") // Сервис users всегда на users:8080
		c.Params = currentParams
	}
}

func main() {
	r := gin.Default()
	r.RedirectTrailingSlash = false
	corsConfig := cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	r.Use(cors.New(corsConfig))

	// --- Публичные маршруты ---
	r.POST("/api/register", makeUsersProxyHandler("/register"))
	r.POST("/api/login", makeUsersProxyHandler("/login"))
	r.GET("/api/users", makeUsersProxyHandler("/users"))                     // /api/users -> users:8080/users
	r.GET("/api/specializations", makeUsersProxyHandler("/specializations")) // /api/specializations -> users:8080/specializations
	r.GET("/api/me", makeUsersProxyHandler("/me"))                           // /api/me -> users:8080/me

	// --- Защищенные маршруты ---
	authGroup := r.Group("/api")
	authGroup.Use(AuthAndHeadersMiddleware())
	{
		// Specializations
		authGroup.POST("/specializations", makeUsersProxyHandler("/specializations"))         // /api/specializations -> users:8080/specializations
		authGroup.PUT("/specializations/*path", makeUsersProxyHandler("/specializations"))    // /api/specializations/1 -> users:8080/specializations/1
		authGroup.DELETE("/specializations/*path", makeUsersProxyHandler("/specializations")) // /api/specializations/1 -> users:8080/specializations/1

		// Users
		authGroup.PATCH("/users/*path", makeUsersProxyHandler("/users"))  // /api/users/1 -> users:8080/users/1
		authGroup.DELETE("/users/*path", makeUsersProxyHandler("/users")) // /api/users/1 -> users:8080/users/1
		authGroup.PUT("/me", makeUsersProxyHandler("/me"))                // /api/me -> users:8080/me

		// --- ИСПРАВЛЕННЫЙ ПОРЯДОК И ЛОГИКА ДЛЯ SCHEDULES ---
		// 1. Явный маршрут для POST /api/schedules (корень группы schedules)
		authGroup.POST("/schedules", func(c *gin.Context) {
			// c.Param("path") здесь не используется, так как нет именованного параметра в маршруте
			// Мы хотим проксировать на корень сервиса schedules, т.е. на "/"
			// Для этого в proxy pathParam должен быть "" или "/", чтобы finalPathPart стал "/"
			currentParams := c.Params
			c.Params = gin.Params{gin.Param{Key: "path", Value: ""}} // proxy сделает из этого "/"
			proxy(c, "http://schedules:8082")
			c.Params = currentParams
		})

		// 2. Общий маршрут для всего остального внутри /schedules
		// (GET /my, GET /doctor/:id, DELETE /:id)
		authGroup.Any("/schedules/*path", func(c *gin.Context) {
			// Здесь c.Param("path") будет содержать, например, "/my" или "/doctor/1" или "/1"
			proxy(c, "http://schedules:8082")
		})
		// --- КОНЕЦ ИСПРАВЛЕННОГО ПОРЯДКА ДЛЯ SCHEDULES ---

		// Appointments
		authGroup.Any("/appointments/*path", func(c *gin.Context) { proxy(c, "http://appointments:8083") })
		// Medical Records
		authGroup.Any("/medical_records/*path", func(c *gin.Context) { proxy(c, "http://medical_records:8084") })
		// Payments
		authGroup.Any("/payments/*path", func(c *gin.Context) { proxy(c, "http://payments:8085") })

		// Notifications
		// Сервис notifications ожидает GET на "" (корень) и PATCH на "/:id/read"
		authGroup.GET("/notify", func(c *gin.Context) {
			currentParams := c.Params
			c.Params = gin.Params{gin.Param{Key: "path", Value: ""}} // Проксируем на корень сервиса notifications
			proxy(c, "http://notifications:8086")                    // Базовый URL без /notify
			c.Params = currentParams
		})
		authGroup.PATCH("/notify/*path", func(c *gin.Context) { // *path будет "/:id/read"
			proxy(c, "http://notifications:8086") // Базовый URL без /notify
		})
	}

	port := ":8000"
	log.Printf("API Gateway (с CORS и RedirectTrailingSlash=false) запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска API Gateway: %v", err)
	}
}
