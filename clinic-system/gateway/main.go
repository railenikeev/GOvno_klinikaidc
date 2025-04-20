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
	req.Header = c.Request.Header

	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "сервис недоступен"})
		return
	}
	defer resp.Body.Close()

	c.Status(resp.StatusCode)
	for k, values := range resp.Header {
		for _, v := range values {
			c.Writer.Header().Add(k, v)
		}
	}
	if _, err := io.Copy(c.Writer, resp.Body); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка копирования данных"})
	}
}

func main() {
	r := gin.Default()

	// === USERS SERVICE ===
	// регистрация, логин, профиль, а теперь и админские эндпоинты:
	r.Any("/api/users/*path", func(c *gin.Context) {
		proxy(c, "http://users:8080"+c.Param("path"))
	})

	// === ADMIN DASHBOARD ===
	// статистика
	r.Any("/api/admin/stats", func(c *gin.Context) {
		proxy(c, "http://users:8080/admin/stats")
	})
	// пациенты
	r.Any("/api/admin/patients", func(c *gin.Context) {
		proxy(c, "http://users:8080/admin/patients")
	})
	// врачи
	r.Any("/api/admin/doctors", func(c *gin.Context) {
		proxy(c, "http://users:8080/admin/doctors")
	})
	// записи (передаём в appointments‑сервис)
	r.Any("/api/admin/appointments", func(c *gin.Context) {
		proxy(c, "http://appointments:8083/appointments")
	})
	// платежи (передаём в payments‑сервис)
	r.Any("/api/admin/payments", func(c *gin.Context) {
		proxy(c, "http://payments:8085/payments")
	})

	// === DOCTORS CRUD ===
	// для фронта — все запросы к /api/doctors
	r.Any("/api/doctors", func(c *gin.Context) {
		// GET /api/doctors, POST /api/doctors
		proxy(c, "http://users:8080/doctors")
	})
	r.Any("/api/doctors/*path", func(c *gin.Context) {
		// PUT, DELETE, GET /api/doctors/:id и т.п.
		proxy(c, "http://users:8080/doctors"+c.Param("path"))
	})

	// === CLINICS SERVICE ===
	r.Any("/api/clinics", func(c *gin.Context) {
		proxy(c, "http://clinics:8087/clinics")
	})
	r.Any("/api/clinics/*path", func(c *gin.Context) {
		proxy(c, "http://clinics:8087/clinics"+c.Param("path"))
	})

	// остальные сервисы
	r.Any("/api/schedules/*path", func(c *gin.Context) {
		proxy(c, "http://schedules:8082"+c.Param("path"))
	})
	r.Any("/api/appointments/*path", func(c *gin.Context) {
		proxy(c, "http://appointments:8083"+c.Param("path"))
	})
	r.Any("/api/medical_records/*path", func(c *gin.Context) {
		proxy(c, "http://medical_records:8084"+c.Param("path"))
	})
	r.Any("/api/payments/*path", func(c *gin.Context) {
		proxy(c, "http://payments:8085"+c.Param("path"))
	})
	r.Any("/api/notifications/*path", func(c *gin.Context) {
		proxy(c, "http://notifications:8086"+c.Param("path"))
	})

	if err := r.Run(":8000"); err != nil {
		log.Fatal("Ошибка запуска API gateway:", err)
	}
}
