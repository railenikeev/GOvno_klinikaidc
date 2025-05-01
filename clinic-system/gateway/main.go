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

	"github.com/gin-contrib/cors" // Импорт CORS middleware
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// --- JWT Secret ---
var jwtSecret = []byte(os.Getenv("JWT_SECRET"))

func init() {
	if len(jwtSecret) == 0 {
		log.Println("ПРЕДУПРЕЖДЕНИЕ (Gateway): Переменная окружения JWT_SECRET не установлена, используется значение по умолчанию 'supersecret'.")
		jwtSecret = []byte("supersecret")
	}
}

// --- Функция извлечения ID пользователя ---
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

// --- Структура пользователя ---
type User struct {
	ID                 int     `json:"id"`
	FullName           string  `json:"full_name"`
	Email              string  `json:"email"`
	Phone              string  `json:"phone"`
	Role               string  `json:"role"`
	SpecializationID   *int    `json:"specialization_id,omitempty"`
	SpecializationName *string `json:"specialization_name,omitempty"`
}

// --- Функция получения данных пользователя ---
func getUserDataFromUsersService(userID int) (*User, error) {
	usersServiceURL := fmt.Sprintf("http://users:8080/users/%d", userID)
	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest("GET", usersServiceURL, nil)
	if err != nil {
		log.Printf("Gateway: Ошибка создания запроса к users service: %v", err)
		return nil, fmt.Errorf("внутренняя ошибка шлюза")
	}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Gateway: Ошибка вызова users service (%s): %v", usersServiceURL, err)
		return nil, fmt.Errorf("сервис пользователей недоступен")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("Gateway: Users service вернул статус %d для user %d. Body: %s", resp.StatusCode, userID, string(bodyBytes))
		if resp.StatusCode == http.StatusNotFound {
			return nil, fmt.Errorf("пользователь с ID %d не найден в сервисе пользователей", userID)
		}
		return nil, fmt.Errorf("сервис пользователей вернул ошибку (статус %d)", resp.StatusCode)
	}
	var user User
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		log.Printf("Gateway: Ошибка декодирования данных пользователя из users service: %v", err)
		return nil, fmt.Errorf("ошибка обработки ответа от сервиса пользователей")
	}
	if user.Role == "" {
		log.Printf("Gateway: Получены неполные данные пользователя (отсутствует роль) для userID %d", userID)
		return nil, fmt.Errorf("не удалось получить роль пользователя")
	}
	return &user, nil
}

// --- Middleware аутентификации ---
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
		c.Request.Header.Del("Authorization")
		c.Request.Header.Set("X-User-ID", strconv.Itoa(user.ID))
		c.Request.Header.Set("X-User-Role", user.Role)
		c.Next()
	}
}

// --- Хелпер проксирования ---
func proxy(c *gin.Context, targetServiceBaseURL string) {
	targetPath := c.Param("path") // Предполагаем, что путь всегда передается через *path
	// Если path пустой (например, для /api/login), используем оригинальный путь запроса к шлюзу
	if targetPath == "" {
		// Удаляем префикс /api (если он есть)
		if strings.HasPrefix(c.Request.URL.Path, "/api") {
			// /api/login -> /login
			// /api/users -> /users
			// /api/specializations -> /specializations
			targetPath = strings.TrimPrefix(c.Request.URL.Path, "/api")
		} else {
			// Если префикса нет, используем как есть (маловероятно в текущей структуре)
			targetPath = c.Request.URL.Path
		}
	}

	finalURL := targetServiceBaseURL + targetPath
	if c.Request.URL.RawQuery != "" {
		finalURL += "?" + c.Request.URL.RawQuery
	}
	proxyReq, err := http.NewRequest(c.Request.Method, finalURL, c.Request.Body)
	if err != nil {
		log.Printf("Gateway: Ошибка создания прокси-запроса для %s: %v", finalURL, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка шлюза при создании запроса"})
		return
	}
	proxyReq.Header = c.Request.Header
	proxyReq.Header.Del("Host")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(proxyReq)
	if err != nil {
		log.Printf("Gateway: Ошибка при вызове целевого сервиса (%s): %v", finalURL, err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Целевой сервис недоступен или вернул ошибку"})
		return
	}
	defer resp.Body.Close()
	c.Status(resp.StatusCode)
	for key, values := range resp.Header {
		for _, value := range values {
			if key == "Content-Length" {
				continue
			}
			c.Writer.Header().Add(key, value)
		}
	}
	_, err = io.Copy(c.Writer, resp.Body)
	if err != nil {
		log.Printf("Gateway: Ошибка копирования тела ответа для %s: %v", finalURL, err)
	}
}

func main() {
	r := gin.Default()

	// Настройка CORS
	corsConfig := cors.Config{
		AllowOrigins:     []string{"*"}, // Разрешаем все для разработки
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	r.Use(cors.New(corsConfig))

	// --- Маршруты ---

	// Хелпер для проксирования на Users Service
	// Передаем базовый URL users service и путь внутри него
	usersProxyHandler := func(targetServicePath string) gin.HandlerFunc {
		return func(c *gin.Context) {
			// Передаем только путь ВНУТРИ сервиса users
			c.Params = append(c.Params, gin.Param{Key: "path", Value: targetServicePath})
			proxy(c, "http://users:8080") // Базовый URL users service
		}
	}

	// Публичные маршруты Users service
	r.POST("/api/register", usersProxyHandler("/register"))
	r.POST("/api/login", usersProxyHandler("/login"))
	r.GET("/api/users", usersProxyHandler("/users"))                     // Для ?role=doctor
	r.GET("/api/specializations", usersProxyHandler("/specializations")) // Новый маршрут

	// Маршрут /me Users service (проверяет токен сам)
	r.GET("/api/me", usersProxyHandler("/me"))

	// Защищенные группы (требуют токена, проверенного шлюзом)
	authGroup := r.Group("/api")
	authGroup.Use(AuthAndHeadersMiddleware())
	{
		// Используем .Any для всех методов HTTP
		// Передаем базовый URL целевого сервиса
		authGroup.Any("/schedules/*path", func(c *gin.Context) { proxy(c, "http://schedules:8082") })
		authGroup.Any("/appointments/*path", func(c *gin.Context) { proxy(c, "http://appointments:8083") })
		authGroup.Any("/medical_records/*path", func(c *gin.Context) { proxy(c, "http://medical_records:8084") })
		authGroup.Any("/payments/*path", func(c *gin.Context) { proxy(c, "http://payments:8085") })
		authGroup.Any("/notify/*path", func(c *gin.Context) { proxy(c, "http://notifications:8086") })
	}

	// --- Запуск шлюза ---
	port := ":8000"
	log.Printf("API Gateway (с CORS) запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска API Gateway: %v", err)
	}
}
