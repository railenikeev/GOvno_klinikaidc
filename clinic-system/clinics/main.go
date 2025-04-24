// clinics/main.go
package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL env not set")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	r := gin.Default()

	/* ─────────────────────────────  CRUD clinics  ─────────────────────────── */

	// получить список клиник
	r.GET("/clinics", func(c *gin.Context) {
		rows, err := db.Query(`SELECT id, city, name, address, phone, admin_id FROM clinics`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		type Clinic struct {
			ID      int    `json:"id"`
			City    string `json:"city"`
			Name    string `json:"name"`
			Address string `json:"address"`
			Phone   string `json:"phone"`
			AdminID *int   `json:"admin_id"`
		}

		var list []Clinic
		for rows.Next() {
			var cl Clinic
			if err := rows.Scan(&cl.ID, &cl.City, &cl.Name, &cl.Address, &cl.Phone, &cl.AdminID); err != nil {
				continue
			}
			list = append(list, cl)
		}
		c.JSON(http.StatusOK, list)
	})

	// создать клинику
	r.POST("/clinics", func(c *gin.Context) {
		var req struct {
			City    string `json:"city"`
			Name    string `json:"name"`
			Address string `json:"address"`
			Phone   string `json:"phone"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "bad json"})
			return
		}
		var id int
		err := db.QueryRow(
			`INSERT INTO clinics (city,name,address,phone)
             VALUES ($1,$2,$3,$4) RETURNING id`,
			req.City, req.Name, req.Address, req.Phone,
		).Scan(&id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"id": id})
	})

	/* ───────────────  назначить / снять администратора клиники  ───────────── */

	// PATCH /clinics/:id/assign-admin   { "userId": 123 }
	r.PATCH("/clinics/:id/assign-admin", func(c *gin.Context) {
		clinicID, _ := strconv.Atoi(c.Param("id"))

		var req struct {
			UserId int `json:"userId"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "bad json"})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer tx.Rollback()

		// 1) обновляем таблицу clinics
		if _, err := tx.Exec(`UPDATE clinics SET admin_id=$1 WHERE id=$2`, req.UserId, clinicID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		// 2) обновляем роль пользователя
		if _, err := tx.Exec(`UPDATE users SET role='clinic_admin', clinic_id=$1 WHERE id=$2`, clinicID, req.UserId); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Status(http.StatusNoContent)
	})

	// PATCH /clinics/:id/remove-admin
	r.PATCH("/clinics/:id/remove-admin", func(c *gin.Context) {
		clinicID, _ := strconv.Atoi(c.Param("id"))

		// сначала узнаём, кто сейчас админ
		var adminID sql.NullInt64
		if err := db.QueryRow(
			`SELECT admin_id FROM clinics WHERE id=$1`, clinicID,
		).Scan(&adminID); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "clinic not found"})
			return
		}
		if !adminID.Valid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "no admin set"})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer tx.Rollback()

		// 1) снимаем админа в clinics
		if _, err := tx.Exec(`UPDATE clinics SET admin_id=NULL WHERE id=$1`, clinicID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		// 2) возвращаем пользователю роль patient и обнуляем clinic_id
		if _, err := tx.Exec(`UPDATE users SET role='patient', clinic_id=NULL WHERE id=$1`, adminID.Int64); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Status(http.StatusNoContent)
	})

	/* ────────────────────────────────  run  ─────────────────────────────── */

	if err := r.Run(":8087"); err != nil {
		log.Fatal(err)
	}
}
