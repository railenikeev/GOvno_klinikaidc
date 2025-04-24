// clinic-system/clinics/main.go
package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

/* ────────── модели ────────── */

type Clinic struct {
	ID      int    `json:"id"`
	City    string `json:"city"`
	Name    string `json:"name"`
	Address string `json:"address"`
	Phone   string `json:"phone"`
}

type Admin struct {
	ID       int    `json:"id"`
	FullName string `json:"fullName"`
	Email    string `json:"email"`
}

type ClinicWithAdmin struct {
	Clinic
	Admin *Admin `json:"admin,omitempty"`
}

/* ────────── main ────────── */

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

	/* ────────── POST /clinics ────────── */
	r.POST("/clinics", func(c *gin.Context) {
		var cl Clinic
		if err := c.BindJSON(&cl); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный JSON"})
			return
		}
		if err := db.QueryRow(
			`INSERT INTO clinics (city, name, address, phone)
			 VALUES ($1,$2,$3,$4) RETURNING id`,
			cl.City, cl.Name, cl.Address, cl.Phone,
		).Scan(&cl.ID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось создать клинику"})
			return
		}
		c.JSON(http.StatusCreated, cl)
	})

	/* ────────── GET /clinics ────────── */
	r.GET("/clinics", func(c *gin.Context) {
		rows, err := db.Query(`
			SELECT c.id, c.city, c.name, c.address, c.phone,
			       u.id, u.full_name, u.email
			FROM clinics c
			LEFT JOIN users u
			  ON u.clinic_id = c.id AND u.role = 'clinic_admin'
			ORDER BY c.id`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при запросе клиник"})
			return
		}
		defer rows.Close()

		list := []ClinicWithAdmin{}
		for rows.Next() {
			var cl ClinicWithAdmin
			var admID sql.NullInt64
			var admName, admEmail sql.NullString

			if err := rows.Scan(&cl.ID, &cl.City, &cl.Name, &cl.Address, &cl.Phone,
				&admID, &admName, &admEmail); err != nil {
				continue
			}
			if admID.Valid {
				cl.Admin = &Admin{
					ID:       int(admID.Int64),
					FullName: admName.String,
					Email:    admEmail.String,
				}
			}
			list = append(list, cl)
		}
		c.JSON(http.StatusOK, list)
	})

	/* ────────── PATCH /clinics/:id ────────── */
	r.PATCH("/clinics/:id", func(c *gin.Context) {
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "некорректный id"})
			return
		}

		var upd Clinic
		if err := c.BindJSON(&upd); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный JSON"})
			return
		}

		// собираем динамический UPDATE только по переданным полям
		fields, args := []string{}, []interface{}{}
		add := func(col string, val string) {
			if val != "" {
				fields = append(fields, fmt.Sprintf("%s = $%d", col, len(args)+1))
				args = append(args, val)
			}
		}
		add("city", upd.City)
		add("name", upd.Name)
		add("address", upd.Address)
		add("phone", upd.Phone)

		if len(fields) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "нет данных для обновления"})
			return
		}
		args = append(args, id)

		query := fmt.Sprintf(`UPDATE clinics SET %s WHERE id = $%d`,
			strings.Join(fields, ", "), len(args))
		if _, err := db.Exec(query, args...); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось обновить клинику"})
			return
		}
		upd.ID = id
		c.JSON(http.StatusOK, upd)
	})

	/* ────────── DELETE /clinics/:id ────────── */
	r.DELETE("/clinics/:id", func(c *gin.Context) {
		res, err := db.Exec(`DELETE FROM clinics WHERE id = $1`, c.Param("id"))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось удалить клинику"})
			return
		}
		if cnt, _ := res.RowsAffected(); cnt == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "клиника не найдена"})
			return
		}
		c.Status(http.StatusNoContent)
	})

	/* ────────── PATCH /clinics/:id/assign-admin ────────── */
	r.PATCH("/clinics/:id/assign-admin", func(c *gin.Context) {
		var body struct {
			UserID int `json:"userId"`
		}
		if err := c.BindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "неправильный JSON"})
			return
		}
		if _, err := db.Exec(
			`UPDATE users SET clinic_id = $1, role = 'clinic_admin' WHERE id = $2`,
			c.Param("id"), body.UserID,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось назначить администратора"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Администратор назначен"})
	})

	/* ────────── run ────────── */
	if err := r.Run(":8087"); err != nil {
		log.Fatal("Ошибка запуска clinics сервиса:", err)
	}
}
