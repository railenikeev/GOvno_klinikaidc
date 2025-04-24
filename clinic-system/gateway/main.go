package main

import (
	"io"
	"log"
	"net/http"
	"net/url"

	"github.com/gin-gonic/gin"
)

// ---------------------------------------------------------------
// proxy helper: полностью пробрасываем метод, body, headers,
// path + query string     (ex.: /api/doctors?clinic_id=1      )
// ---------------------------------------------------------------
func proxy(c *gin.Context, targetBase string) {
	// собираем полный URL: targetBase + original.Path + "?" + RawQuery
	u, err := url.Parse(targetBase)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "bad proxy target"})
		return
	}
	u.Path += c.Param("path")           // может быть пусто
	u.RawQuery = c.Request.URL.RawQuery // сохраняем query-строку

	req, err := http.NewRequest(c.Request.Method, u.String(), c.Request.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "proxy request error"})
		return
	}
	req.Header = c.Request.Header // копируем все заголовки

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream unavailable"})
		return
	}
	defer resp.Body.Close()

	// прокидываем статус и заголовки
	c.Status(resp.StatusCode)
	for k, v := range resp.Header {
		for _, vv := range v {
			c.Writer.Header().Add(k, vv)
		}
	}
	_, _ = io.Copy(c.Writer, resp.Body)
}

func main() {
	r := gin.Default()

	// ---------- USERS SERVICE -------------
	r.Any("/api/users/*path", func(c *gin.Context) {
		proxy(c, "http://users:8080")
	})
	// /api/doctors?clinic_id=...
	r.Any("/api/doctors", func(c *gin.Context) {
		// c.Param("path") будет пустой, но proxy добавит query
		proxy(c, "http://users:8080")
	})

	// ---------- CLINICS SERVICE -----------
	r.Any("/api/clinics", func(c *gin.Context) {
		proxy(c, "http://clinics:8087/clinics")
	})
	r.Any("/api/clinics/*path", func(c *gin.Context) {
		proxy(c, "http://clinics:8087/clinics")
	})

	// ---------- SCHEDULES -----------------
	r.Any("/api/schedules/*path", func(c *gin.Context) {
		proxy(c, "http://schedules:8082")
	})

	// ---------- APPOINTMENTS --------------
	r.Any("/api/appointments/*path", func(c *gin.Context) {
		proxy(c, "http://appointments:8083")
	})

	// ---------- MEDICAL RECORDS -----------
	r.Any("/api/medical_records/*path", func(c *gin.Context) {
		proxy(c, "http://medical_records:8084")
	})

	// ---------- PAYMENTS ------------------
	r.Any("/api/payments/*path", func(c *gin.Context) {
		proxy(c, "http://payments:8085")
	})

	// ---------- NOTIFICATIONS -------------
	r.Any("/api/notifications/*path", func(c *gin.Context) {
		proxy(c, "http://notifications:8086")
	})

	log.Println("API-gateway listening on :8000")
	if err := r.Run(":8000"); err != nil {
		log.Fatalf("gateway start error: %v", err)
	}
}
