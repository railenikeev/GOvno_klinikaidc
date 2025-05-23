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
	usersServiceURL := fmt.Sprintf("http://users:8080/users/%d", userID)
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
		c.Request.Header.Del("Authorization")
		c.Request.Header.Set("X-User-ID", strconv.Itoa(user.ID))
		c.Request.Header.Set("X-User-Role", user.Role)
		log.Printf("[Gateway AuthMiddleware] User %d (%s) authenticated. Forwarding request.", user.ID, user.Role)
		c.Next()
	}
}

func proxy(c *gin.Context, targetServiceBaseURL string) {
	pathParam := c.Param("path")

	log.Printf("[Gateway Proxy] Original Request URL: %s, Method: %s, c.Param(\"path\"): '%s', Target Base: %s",
		c.Request.URL.Path, c.Request.Method, pathParam, targetServiceBaseURL)

	var finalPathPart string
	if pathParam == "" {
		finalPathPart = "/"
	} else if !strings.HasPrefix(pathParam, "/") {
		finalPathPart = "/" + pathParam
	} else {
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

func makeUsersProxyHandler(servicePath string) gin.HandlerFunc {
	return func(c *gin.Context) {
		pathSuffix := c.Param("path")

		fullServicePath := servicePath + pathSuffix

		currentParams := c.Params
		c.Params = gin.Params{gin.Param{Key: "path", Value: fullServicePath}}
		proxy(c, "http://users:8080")
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

	r.POST("/api/register", makeUsersProxyHandler("/register"))
	r.POST("/api/login", makeUsersProxyHandler("/login"))
	r.GET("/api/users", makeUsersProxyHandler("/users"))
	r.GET("/api/specializations", makeUsersProxyHandler("/specializations"))
	r.GET("/api/me", makeUsersProxyHandler("/me"))

	authGroup := r.Group("/api")
	authGroup.Use(AuthAndHeadersMiddleware())
	{
		authGroup.POST("/specializations", makeUsersProxyHandler("/specializations"))
		authGroup.PUT("/specializations/*path", makeUsersProxyHandler("/specializations"))
		authGroup.DELETE("/specializations/*path", makeUsersProxyHandler("/specializations"))

		authGroup.GET("/users/*path", makeUsersProxyHandler("/users"))
		authGroup.PATCH("/users/*path", makeUsersProxyHandler("/users"))
		authGroup.DELETE("/users/*path", makeUsersProxyHandler("/users"))
		authGroup.PUT("/me", makeUsersProxyHandler("/me"))

		authGroup.POST("/schedules", func(c *gin.Context) {
			currentParams := c.Params
			c.Params = gin.Params{gin.Param{Key: "path", Value: ""}}
			proxy(c, "http://schedules:8082")
			c.Params = currentParams
		})

		authGroup.Any("/schedules/*path", func(c *gin.Context) {
			proxy(c, "http://schedules:8082")
		})

		authGroup.POST("/appointments", func(c *gin.Context) {
			currentParams := c.Params
			c.Params = gin.Params{gin.Param{Key: "path", Value: ""}}
			proxy(c, "http://appointments:8083")
			c.Params = currentParams
		})

		authGroup.GET("/appointments", func(c *gin.Context) {
			currentParams := c.Params
			c.Params = gin.Params{gin.Param{Key: "path", Value: ""}}
			proxy(c, "http://appointments:8083")
			c.Params = currentParams
		})

		authGroup.Any("/appointments/*path", func(c *gin.Context) {
			proxy(c, "http://appointments:8083")
		})

		authGroup.GET("/medical_records", func(c *gin.Context) {
			currentParams := c.Params
			tempParams := make(gin.Params, 0, len(currentParams)+1)
			for _, p := range currentParams {
				if p.Key != "path" {
					tempParams = append(tempParams, p)
				}
			}
			tempParams = append(tempParams, gin.Param{Key: "path", Value: "/records"})
			c.Params = tempParams

			proxy(c, "http://medical_records:8084")
			c.Params = currentParams
		})

		authGroup.POST("/medical_records", func(c *gin.Context) {
			currentParams := c.Params
			tempParams := make(gin.Params, 0, len(currentParams)+1)
			for _, p := range currentParams {
				if p.Key != "path" {
					tempParams = append(tempParams, p)
				}
			}
			tempParams = append(tempParams, gin.Param{Key: "path", Value: "/records"})
			c.Params = tempParams

			proxy(c, "http://medical_records:8084")
			c.Params = currentParams
		})

		authGroup.Any("/medical_records/*path", func(c *gin.Context) {
			subPath := c.Param("path")
			currentParams := c.Params

			tempParams := make(gin.Params, 0, len(currentParams)+1)
			for _, p := range currentParams {
				if p.Key != "path" {
					tempParams = append(tempParams, p)
				}
			}

			tempParams = append(tempParams, gin.Param{Key: "path", Value: "/records" + subPath})
			c.Params = tempParams

			proxy(c, "http://medical_records:8084")
			c.Params = currentParams
		})

		authGroup.Any("/payments/*path", func(c *gin.Context) { proxy(c, "http://payments:8085") })

		authGroup.GET("/notify", func(c *gin.Context) {
			currentParams := c.Params
			c.Params = gin.Params{gin.Param{Key: "path", Value: ""}}
			proxy(c, "http://notifications:8086")
			c.Params = currentParams
		})
		authGroup.PATCH("/notify/*path", func(c *gin.Context) {
			proxy(c, "http://notifications:8086")
		})
	}

	port := ":8000"
	log.Printf("API Gateway (с CORS и RedirectTrailingSlash=false) запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска API Gateway: %v", err)
	}
}
