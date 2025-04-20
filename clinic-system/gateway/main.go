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
	// копируем заголовки
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

	// users service
	r.Any("/api/users/*path", func(c *gin.Context) {
		target := "http://users:8080" + c.Param("path")
		proxy(c, target)
	})

	// schedules service
	r.Any("/api/schedules/*path", func(c *gin.Context) {
		target := "http://schedules:8082" + c.Param("path")
		proxy(c, target)
	})

	// appointments service
	r.Any("/api/appointments/*path", func(c *gin.Context) {
		target := "http://appointments:8083" + c.Param("path")
		proxy(c, target)
	})

	// medical_records service
	r.Any("/api/medical_records/*path", func(c *gin.Context) {
		target := "http://medical_records:8084" + c.Param("path")
		proxy(c, target)
	})

	// payments service
	r.Any("/api/payments/*path", func(c *gin.Context) {
		target := "http://payments:8085" + c.Param("path")
		proxy(c, target)
	})

	// notifications service
	r.Any("/api/notifications/*path", func(c *gin.Context) {
		target := "http://notifications:8086" + c.Param("path")
		proxy(c, target)
	})

	// clinics service: exact /api/clinics
	r.Any("/api/clinics", func(c *gin.Context) {
		// POST /api/clinics and GET /api/clinics
		proxy(c, "http://clinics:8087/clinics")
	})
	// clinics service: all deeper routes, e.g. /api/clinics/{id}/assign-admin
	r.Any("/api/clinics/*path", func(c *gin.Context) {
		proxy(c, "http://clinics:8087/clinics"+c.Param("path"))
	})

	if err := r.Run(":8000"); err != nil {
		log.Fatal("Ошибка запуска API gateway:", err)
	}
}
