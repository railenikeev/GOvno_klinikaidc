// clinic-system/clinics/main.go
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

type Clinic struct {
	ID      int        `json:"id"`
	City    string     `json:"city"`
	Name    string     `json:"name"`
	Address string     `json:"address"`
	Phone   string     `json:"phone"`
	Admin   *UserShort `json:"admin,omitempty"`
}

type UserShort struct {
	ID       int    `json:"id"`
	FullName string `json:"fullName"`
	Email    string `json:"email"`
}

func main() {
	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	r := gin.Default()

	// ----------- список клиник -------------
	r.GET("/clinics", func(c *gin.Context) {
		rows, err := db.Query(`
      SELECT c.id, c.city, c.name, c.address, c.phone,
             u.id, COALESCE(u.full_name,''), COALESCE(u.email,'')
      FROM clinics c
      LEFT JOIN users u ON u.id = c.admin_id
    `)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db query error"})
			return
		}
		defer rows.Close()

		var list []Clinic
		for rows.Next() {
			var cl Clinic
			var uid sql.NullInt64
			var fn, em string
			if err := rows.Scan(
				&cl.ID, &cl.City, &cl.Name, &cl.Address, &cl.Phone,
				&uid, &fn, &em,
			); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "scan error"})
				return
			}
			if uid.Valid {
				cl.Admin = &UserShort{
					ID:       int(uid.Int64),
					FullName: fn,
					Email:    em,
				}
			}
			list = append(list, cl)
		}
		if err := rows.Err(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "rows error"})
			return
		}
		c.JSON(http.StatusOK, list)
	})

	// ----------- создать клинику -------------
	r.POST("/clinics", func(c *gin.Context) {
		var req Clinic
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "bad json"})
			return
		}
		var newID int
		err := db.QueryRow(
			`INSERT INTO clinics (city, name, address, phone)
       VALUES ($1, $2, $3, $4) RETURNING id`,
			req.City, req.Name, req.Address, req.Phone,
		).Scan(&newID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "insert error"})
			return
		}
		req.ID = newID
		c.JSON(http.StatusCreated, req)
	})

	// ----------- назначить администратора -------------
	r.PATCH("/clinics/:id/assign-admin", func(c *gin.Context) {
		clinicID, _ := strconv.Atoi(c.Param("id"))
		var req struct {
			UserID int `json:"userId"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "bad json"})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "tx begin error"})
			return
		}

		// 1) обновляем роль пользователя
		if _, err := tx.Exec(
			`UPDATE users SET role = 'clinic_admin', clinic_id = $1 WHERE id = $2`,
			clinicID, req.UserID,
		); err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "update user"})
			return
		}

		// 2) пишем admin_id в клинику
		if _, err := tx.Exec(
			`UPDATE clinics SET admin_id = $1 WHERE id = $2`,
			req.UserID, clinicID,
		); err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "update clinic"})
			return
		}

		tx.Commit()
		c.Status(http.StatusNoContent)
	})

	// ----------- снять администратора -------------
	r.PATCH("/clinics/:id/remove-admin", func(c *gin.Context) {
		clinicID, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неверный id"})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "tx error"})
			return
		}
		defer tx.Rollback()

		var adminID sql.NullInt64
		if err := tx.QueryRow(
			`SELECT admin_id FROM clinics WHERE id = $1 FOR UPDATE`,
			clinicID,
		).Scan(&adminID); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "клиника не найдена"})
			return
		}
		if !adminID.Valid {
			tx.Commit()
			c.Status(http.StatusNoContent)
			return
		}

		// 1) убираем admin_id у клиники
		if _, err := tx.Exec(
			`UPDATE clinics SET admin_id = NULL WHERE id = $1`,
			clinicID,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "update clinics"})
			return
		}

		// 2) понижаем роль пользователя
		if _, err := tx.Exec(
			`UPDATE users SET role = 'patient' WHERE id = $1`,
			adminID.Int64,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "update user role"})
			return
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "commit error"})
			return
		}
		c.Status(http.StatusNoContent)
	})

	r.Run(":8087") // порт как в docker-compose
}
