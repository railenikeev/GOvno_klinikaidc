// api-gateway/main.go

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
	// копируем все заголовки от клиента
	req.Header = c.Request.Header

	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "сервис недоступен"})
		return
	}
	defer resp.Body.Close()

	// пробрасываем статус от бэкенда
	c.Status(resp.StatusCode)
	// пробрасываем все заголовки от бэкенда
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

	// USERS
	r.Any("/api/users/*path", func(c *gin.Context) {
		// users_service — имя контейнера из docker-compose
		target := "http://users_service:8080" + c.Param("path")
		proxy(c, target)
	})

	// SCHEDULES
	r.Any("/api/schedules/*path", func(c *gin.Context) {
		target := "http://schedules_service:8082" + c.Param("path")
		proxy(c, target)
	})

	// APPOINTMENTS
	r.Any("/api/appointments/*path", func(c *gin.Context) {
		target := "http://appointments_service:8083" + c.Param("path")
		proxy(c, target)
	})

	// MEDICAL_RECORDS
	r.Any("/api/medical_records/*path", func(c *gin.Context) {
		target := "http://medical_records_service:8084" + c.Param("path")
		proxy(c, target)
	})

	// PAYMENTS
	r.Any("/api/payments/*path", func(c *gin.Context) {
		target := "http://payments_service:8085" + c.Param("path")
		proxy(c, target)
	})

	// NOTIFICATIONS
	r.Any("/api/notifications/*path", func(c *gin.Context) {
		target := "http://notifications_service:8086" + c.Param("path")
		proxy(c, target)
	})

	// CLINICS — точка без “*”, то есть GET /api/clinics и POST /api/clinics
	r.Any("/api/clinics", func(c *gin.Context) {
		proxy(c, "http://clinics_service:8087/clinics")
	})
	// CLINICS — все остальные маршруты: /api/clinics/{id}/…
	r.Any("/api/clinics/*path", func(c *gin.Context) {
		proxy(c, "http://clinics_service:8087/clinics"+c.Param("path"))
	})

	log.Println("API gateway запущен на :8000")
	if err := r.Run(":8000"); err != nil {
		log.Fatal("Ошибка запуска API gateway:", err)
	}
}
