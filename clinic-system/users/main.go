package main

import (
	"errors"
	"log"
	"net/http/httputil"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

var jwtSecret = []byte("supersecret") // Должен совпадать с тем, что в users_service

// Извлекаем user_id из Authorization: Bearer <token>
func extractUserID(c *gin.Context) (string, error) {
	auth := c.GetHeader("Authorization")
	if auth == "" {
		return "", errors.New("no auth header")
	}
	parts := strings.Fields(auth)
	if len(parts) != 2 || parts[0] != "Bearer" {
		return "", errors.New("invalid auth header")
	}
	tokenStr := parts[1]

	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})
	if err != nil || !token.Valid {
		return "", err
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", errors.New("invalid token claims")
	}
	raw, ok := claims["user_id"]
	if !ok {
		return "", errors.New("no user_id in token")
	}
	// Обычно в JWT числа приходят как float64
	switch v := raw.(type) {
	case float64:
		return strconv.Itoa(int(v)), nil
	case string:
		return v, nil
	default:
		return "", errors.New("user_id has unexpected type")
	}
}

// Создаёт ReverseProxy на заданный URL
func newProxy(target string) *httputil.ReverseProxy {
	u, err := url.Parse(target)
	if err != nil {
		log.Fatalf("invalid proxy URL %q: %v", target, err)
	}
	return httputil.NewSingleHostReverseProxy(u)
}

func main() {
	// Читаем endpoints из окружения или берём дефолтные
	usersURL := os.Getenv("USERS_SERVICE_URL")
	if usersURL == "" {
		usersURL = "http://users_service:8080"
	}
	clinicsURL := os.Getenv("CLINICS_SERVICE_URL")
	if clinicsURL == "" {
		clinicsURL = "http://clinics_service:8081"
	}
	appointmentsURL := os.Getenv("APPOINTMENTS_SERVICE_URL")
	if appointmentsURL == "" {
		appointmentsURL = "http://appointments_service:8082"
	}

	userProxy := newProxy(usersURL)
	clinicProxy := newProxy(clinicsURL)
	apptProxy := newProxy(appointmentsURL)

	r := gin.Default()

	// Прокси для users
	r.Any("/api/users/*path", func(c *gin.Context) {
		// Ставим X-User-ID
		if uid, err := extractUserID(c); err == nil {
			c.Request.Header.Set("X-User-ID", uid)
		}
		// Преобразуем URL /api/users/... → /...
		c.Request.URL.Path = strings.TrimPrefix(c.Request.URL.Path, "/api/users")
		userProxy.ServeHTTP(c.Writer, c.Request)
	})

	// Прокси для clinics
	r.Any("/api/clinics/*path", func(c *gin.Context) {
		c.Request.URL.Path = strings.TrimPrefix(c.Request.URL.Path, "/api/clinics")
		clinicProxy.ServeHTTP(c.Writer, c.Request)
	})

	// Прокси для appointments
	r.Any("/api/appointments/*path", func(c *gin.Context) {
		c.Request.URL.Path = strings.TrimPrefix(c.Request.URL.Path, "/api/appointments")
		apptProxy.ServeHTTP(c.Writer, c.Request)
	})

	// Запускаем на 8000 порту
	if err := r.Run(":8000"); err != nil {
		log.Fatalf("failed to run gateway: %v", err)
	}
}
