package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

type Clinic struct {
	ID      int    `json:"id"`
	City    string `json:"city"`
	Name    string `json:"name"`
	Address string `json:"address"`
	Phone   string `json:"phone"`
}

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL не задан")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal("Не удалось подключиться к БД:", err)
	}
	defer db.Close()

	r := gin.Default()

	// POST /clinics — создание клиники
	r.POST("/clinics", func(c *gin.Context) {
		var clinic Clinic
		if err := c.BindJSON(&clinic); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный JSON"})
			return
		}

		err := db.QueryRow(`
			INSERT INTO clinics (city, name, address, phone)
			VALUES ($1, $2, $3, $4)
			RETURNING id`,
			clinic.City, clinic.Name, clinic.Address, clinic.Phone).Scan(&clinic.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось создать клинику"})
			return
		}

		c.JSON(http.StatusCreated, clinic)
	})

	// GET /clinics — список всех клиник
	r.GET("/clinics", func(c *gin.Context) {
		rows, err := db.Query(`SELECT id, city, name, address, phone FROM clinics`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при запросе клиник"})
			return
		}
		defer rows.Close()

		var clinics []Clinic
		for rows.Next() {
			var cl Clinic
			if err := rows.Scan(&cl.ID, &cl.City, &cl.Name, &cl.Address, &cl.Phone); err == nil {
				clinics = append(clinics, cl)
			}
		}

		c.JSON(http.StatusOK, clinics)
	})

	// Назначить администратора клиники
	r.PATCH("/clinics/:id/assign-admin", func(c *gin.Context) {
		clinicID := c.Param("id")
		var req struct {
			UserID int `json:"userId"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный JSON"})
			return
		}

		// Привязать пользователя к клинике и установить роль clinic_admin
		_, err := db.Exec(`UPDATE users SET clinic_id = $1, role = 'clinic_admin' WHERE id = $2`, clinicID, req.UserID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось назначить администратора"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Администратор назначен"})
	})

	if err := r.Run(":8087"); err != nil {
		log.Fatal("Ошибка запуска clinics сервиса:", err)
	}
}
