package main

import (
	"io"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// proxy проксирует запросы на указанный target.
func proxy(c *gin.Context, target string) {
	client := &http.Client{}
	// Создаём новый запрос с тем же методом и телом
	req, err := http.NewRequest(c.Request.Method, target, c.Request.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка проксирования"})
		return
	}
	// Копируем все заголовки
	req.Header = c.Request.Header

	// Отправляем
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "сервис недоступен"})
		return
	}
	defer resp.Body.Close()

	// Передаём статус-код и заголовки обратно клиенту
	c.Status(resp.StatusCode)
	for k, vv := range resp.Header {
		for _, v := range vv {
			c.Writer.Header().Add(k, v)
		}
	}

	// Копируем тело ответа
	if _, err := io.Copy(c.Writer, resp.Body); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка копирования данных"})
	}
}

func main() {
	r := gin.Default()

	// Проксирование старых сервисов
	r.Any("/api/users/*path", func(c *gin.Context) {
		proxy(c, "http://users:8080"+c.Param("path"))
	})
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

	// Проксирование сервиса клиник
	// 1) без пути — для POST /api/clinics и GET /api/clinics
	r.Any("/api/clinics", func(c *gin.Context) {
		proxy(c, "http://clinics:8087/clinics")
	})
	// 2) с путём — для GET/PUT/DELETE /api/clinics/:id и т.д.
	r.Any("/api/clinics/*path", func(c *gin.Context) {
		target := "http://clinics:8087" + c.Param("path")
		proxy(c, target)
	})

	if err := r.Run(":8000"); err != nil {
		log.Fatal("Ошибка запуска gateway:", err)
	}
}
