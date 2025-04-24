package main

import (
	"github.com/gin-gonic/gin"
	"io"
	"log"
	"net/http"
)

func proxy(c *gin.Context, target string) {
	client := &http.Client{}
	req, _ := http.NewRequest(c.Request.Method, target, c.Request.Body)
	req.Header = c.Request.Header
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "сервис недоступен"})
		return
	}
	defer resp.Body.Close()
	c.Status(resp.StatusCode)
	for k, vs := range resp.Header {
		for _, v := range vs {
			c.Writer.Header().Add(k, v)
		}
	}
	io.Copy(c.Writer, resp.Body)
}

func main() {
	r := gin.Default()

	// === USERS сервис (auth/profile) ===
	r.Any("/api/users/*path", func(c *gin.Context) {
		proxy(c, "http://users:8080"+c.Param("path"))
	})

	// === ADMIN Dashboard ===
	r.GET("/api/admin/stats", func(c *gin.Context) {
		proxy(c, "http://users:8080/admin/stats")
	})
	r.GET("/api/admin/patients", func(c *gin.Context) {
		proxy(c, "http://users:8080/admin/patients")
	})
	r.GET("/api/admin/doctors", func(c *gin.Context) {
		proxy(c, "http://users:8080/admin/doctors")
	})
	r.GET("/api/admin/appointments", func(c *gin.Context) {
		proxy(c, "http://appointments:8083/appointments")
	})
	r.GET("/api/admin/payments", func(c *gin.Context) {
		proxy(c, "http://payments:8085/payments")
	})

	// === Doctors CRUD ===
	r.Any("/api/doctors", func(c *gin.Context) {
		proxy(c, "http://users:8080/doctors")
	})
	r.Any("/api/doctors/:id", func(c *gin.Context) {
		proxy(c, "http://users:8080/doctors/"+c.Param("id"))
	})

	// === Clinics, Schedules, Appointments, Payments, Notifications ===
	r.Any("/api/clinics/*path", func(c *gin.Context) {
		proxy(c, "http://clinics:8087/clinics"+c.Param("path"))
	})
	r.Any("/api/schedules/*path", func(c *gin.Context) {
		proxy(c, "http://schedules:8082"+c.Param("path"))
	})
	r.Any("/api/appointments/*path", func(c *gin.Context) {
		proxy(c, "http://appointments:8083"+c.Param("path"))
	})
	r.Any("/api/payments/*path", func(c *gin.Context) {
		proxy(c, "http://payments:8085"+c.Param("path"))
	})
	r.Any("/api/notifications/*path", func(c *gin.Context) {
		proxy(c, "http://notifications:8086"+c.Param("path"))
	})

	if err := r.Run(":8000"); err != nil {
		log.Fatal(err)
	}
}
