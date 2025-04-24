package main

import (
	"io"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

func proxy(c *gin.Context, target string) {
	client := &http.Client{}
	req, err := http.NewRequest(c.Request.Method, target, c.Request.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка проксирования"})
		return
	}
	// копируем все заголовки
	req.Header = c.Request.Header

	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "сервис недоступен"})
		return
	}
	defer resp.Body.Close()

	// пробрасываем статус
	c.Status(resp.StatusCode)
	// пробрасываем заголовки
	for k, values := range resp.Header {
		for _, v := range values {
			c.Writer.Header().Add(k, v)
		}
	}
	// копируем тело ответа
	if _, err := io.Copy(c.Writer, resp.Body); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка копирования данных"})
	}
}

func main() {
	r := gin.Default()

	// === USERS SERVICE ===
	r.Any("/api/users/*path", func(c *gin.Context) {
		proxy(c, "http://users:8080"+c.Param("path"))
	})

	// === CLINICS SERVICE ===
	r.Any("/api/clinics", func(c *gin.Context) {
		proxy(c, "http://clinics:8087/clinics")
	})
	r.Any("/api/clinics/*path", func(c *gin.Context) {
		proxy(c, "http://clinics:8087/clinics"+c.Param("path"))
	})

	// === SCHEDULES SERVICE ===
	r.Any("/api/schedules", func(c *gin.Context) {
		proxy(c, "http://schedules:8082/schedules")
	})
	r.Any("/api/schedules/*path", func(c *gin.Context) {
		proxy(c, "http://schedules:8082/schedules"+c.Param("path"))
	})

	// === APPOINTMENTS SERVICE ===
	r.Any("/api/appointments", func(c *gin.Context) {
		proxy(c, "http://appointments:8083/appointments")
	})
	r.Any("/api/appointments/*path", func(c *gin.Context) {
		proxy(c, "http://appointments:8083/appointments"+c.Param("path"))
	})

	// === MEDICAL RECORDS SERVICE ===
	r.Any("/api/medical_records/*path", func(c *gin.Context) {
		proxy(c, "http://medical_records:8084"+c.Param("path"))
	})

	// === PAYMENTS SERVICE ===
	r.Any("/api/payments/*path", func(c *gin.Context) {
		proxy(c, "http://payments:8085"+c.Param("path"))
	})

	// === NOTIFICATIONS SERVICE ===
	r.Any("/api/notifications/*path", func(c *gin.Context) {
		proxy(c, "http://notifications:8086"+c.Param("path"))
	})

	if err := r.Run(":8000"); err != nil {
		log.Fatal("Ошибка запуска API gateway:", err)
	}
}
