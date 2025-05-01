package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

/* ──────────────── модели ──────────────── */

type User struct {
	ID             int     `json:"id"`
	FullName       string  `json:"full_name"`
	Email          string  `json:"email"`
	Phone          string  `json:"phone"`
	Role           string  `json:"role"`
	ClinicID       *int    `json:"clinic_id"`
	Specialization *string `json:"specialization,omitempty"`
}

/* ──────────────── JWT ──────────────── */

var jwtSecret = []byte("supersecret") // Точно такой же секрет должен быть в Gateway!

// extractUserID теперь только извлекает ID из токена, не занимается HTTP ответами
func extractUserIDFromToken(tokenStr string) (int, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		// Проверяем, что используется тот же метод подписи
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return 0, fmt.Errorf("неожиданный метод подписи: %v", t.Header["alg"])
		}
		return jwtSecret, nil
	})
	if err != nil || !token.Valid {
		// Сюда попадают ошибки парсинга, просроченные токены и неверные подписи
		return 0, errors.New("некорректный или просроченный токен")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, errors.New("неверный формат claims в токене")
	}
	raw, ok := claims["user_id"]
	if !ok {
		return 0, errors.New("user_id не найден в токене")
	}
	// JWT Claims хранят числа как float64
	idFloat, ok := raw.(float64)
	if !ok {
		return 0, errors.New("user_id в токене не является числом")
	}

	return int(idFloat), nil
}

/* ──────────────── main ──────────────── */

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL не задан")
	}
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal("Ошибка подключения к БД:", err)
	}
	defer db.Close()

	// Проверка соединения
	err = db.Ping()
	if err != nil {
		log.Fatalf("Ошибка пинга БД: %v", err)
	}
	log.Println("Успешное подключение к БД!")

	r := gin.Default()

	/* ---------- регистрация ---------- */
	r.POST("/register", func(c *gin.Context) {
		var req struct {
			FullName       string  `json:"full_name" binding:"required"`
			Email          string  `json:"email" binding:"required,email"`
			Password       string  `json:"password" binding:"required,min=6"`                                      // Добавим базовую валидацию
			Phone          string  `json:"phone"`                                                                  // binding:"required" если нужен
			Role           string  `json:"role" binding:"required,oneof=patient doctor admin_clinic admin_system"` // Проверка роли
			ClinicID       *int    `json:"clinic_id"`
			Specialization *string `json:"specialization"`
		}
		if err := c.ShouldBindJSON(&req); err != nil { // Используем ShouldBindJSON для binding тегов
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}

		// Дополнительная проверка: если роль doctor или admin_clinic, clinic_id должен быть указан? (По вашей логике)
		if (req.Role == "doctor" || req.Role == "admin_clinic") && req.ClinicID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Для роли '%s' требуется clinic_id", req.Role)})
			return
		}
		// Дополнительная проверка: если роль doctor, specialization должен быть указан? (По вашей логике)
		if req.Role == "doctor" && (req.Specialization == nil || *req.Specialization == "") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Для роли 'doctor' требуется специализация"})
			return
		}

		// хэшируем пароль
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("Ошибка при хэшировании пароля: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "внутренняя ошибка сервера"})
			return
		}

		// вставляем в users
		var userID int
		err = db.QueryRow(
			`INSERT INTO users
            (full_name, email, password_hash, phone, role, clinic_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id`,
			req.FullName, req.Email, string(hash), req.Phone, req.Role, req.ClinicID,
		).Scan(&userID)
		if err != nil {
			// Проверка на UNIQUE constrain (например, email уже занят)
			if strings.Contains(err.Error(), "unique constraint") { // Зависит от текста ошибки драйвера
				c.JSON(http.StatusConflict, gin.H{"error": "Пользователь с таким email уже существует"})
				return
			}
			log.Printf("Ошибка БД при регистрации пользователя: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при регистрации пользователя"})
			return
		}

		// если это врач — сразу же создаём запись в таблице doctors
		if req.Role == "doctor" {
			spec := ""
			if req.Specialization != nil {
				spec = *req.Specialization
			}
			// здесь мы используем именно тот же userID, что и в таблице users
			if _, err := db.Exec(
				`INSERT INTO doctors (id, full_name, specialty, clinic_id)
             VALUES ($1,$2,$3,$4)`,
				userID, req.FullName, spec, req.ClinicID,
			); err != nil {
				log.Printf("warning: не удалось добавить в doctors: %v", err)
				// Не фейлим регистрацию, если не удалось добавить в doctors.
				// Возможно, стоит добавить эту логику в сервис doctors,
				// который будет слушать события создания пользователя с ролью doctor.
			}
		}

		c.JSON(http.StatusCreated, gin.H{"id": userID, "message": "Пользователь успешно зарегистрирован"})
	})

	/* ---------- вход ---------- */
	r.POST("/login", func(c *gin.Context) {
		var req struct {
			Email    string `json:"email" binding:"required"`
			Password string `json:"password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil { // Используем ShouldBindJSON
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}
		var id int
		var hash string
		var role string // Получаем роль при логине
		err = db.QueryRow(
			`SELECT id, password_hash, role FROM users WHERE email = $1`,
			req.Email,
		).Scan(&id, &hash, &role)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Неверные учётные данные"})
				return
			}
			log.Printf("Ошибка БД при поиске пользователя: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "внутренняя ошибка сервера"})
			return
		}

		// Проверяем пароль
		err = bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password))
		if err != nil { // Сюда попадают bcrypt.ErrMismatchedHashAndPassword и другие ошибки сравнения
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Неверные учётные данные"})
			return
		}

		// создаём JWT с полем user_id (и, возможно, ролью, если хотим передавать роль в токене)
		// Передача роли в токене немного снижает необходимость запроса к Users service из Gateway,
		// но если роль изменится, токен станет неактуальным до перелогина.
		// Давайте пока оставим только user_id в токене, как у вас было.
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"user_id": id,
			"exp":     time.Now().Add(24 * time.Hour).Unix(), // Срок действия токена
		})
		tokenStr, err := tok.SignedString(jwtSecret)
		if err != nil {
			log.Printf("Ошибка при подписании токена: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "внутренняя ошибка сервера"})
			return
		}

		// возвращаем токен, ID пользователя и его роль
		c.JSON(http.StatusOK, gin.H{
			"token":   tokenStr,
			"user_id": id,   // Часто возвращают ID для удобства клиента
			"role":    role, // Возвращаем роль, чтобы фронтенд мог сразу понять, кто залогинился
		})
	})

	/* ---------- профиль (требует токена) ---------- */
	// Используем функцию extractUserIDFromToken напрямую или через middleware, если хотим защитить этот эндпоинт токеном
	// Давайте сделаем middleware для защиты эндпоинтов, требующих токена.
	// Этот middleware будет похож на то, что мы сделаем в Gateway, но без проверки роли для конкретного ресурса.

	// Middleware для проверки только наличия и валидности токена
	authRequired := func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if auth == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Отсутствует токен аутентификации"})
			c.Abort()
			return
		}
		parts := strings.Fields(auth)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Некорректный формат токена"})
			c.Abort()
			return
		}
		tokenStr := parts[1]
		userID, err := extractUserIDFromToken(tokenStr) // Используем нашу функцию парсинга
		if err != nil {
			// Ошибки парсинга, просрочки, неверной подписи
			c.JSON(http.StatusUnauthorized, gin.H{"error": fmt.Sprintf("Невалидный токен: %v", err.Error())})
			c.Abort()
			return
		}
		// Кладем ID пользователя в контекст для последующих хендлеров
		c.Set("userID", userID)
		c.Next() // Передаем управление следующему хендлеру
	}

	// Эндпоинт для получения данных текущего пользователя (требует аутентификации)
	r.GET("/me", authRequired, func(c *gin.Context) {
		// userID мы получили из контекста благодаря middleware authRequired
		uid, exists := c.Get("userID")
		if !exists {
			// Этого не должно случиться, если middleware отработало, но на всякий случай
			c.JSON(http.StatusInternalServerError, gin.H{"error": "userID не найден в контексте"})
			return
		}
		userID, ok := uid.(int)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Неверный формат userID в контексте"})
			return
		}

		var u User
		// Теперь этот запрос работает с ID из токена, а не из extractUserID, который сам делал ответ
		err = db.QueryRow(
			`SELECT id, full_name, email, phone, role, clinic_id, specialization
				 FROM users WHERE id = $1`,
			userID, // Используем ID из контекста
		).Scan(&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role, &u.ClinicID, &u.Specialization)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
				return
			}
			log.Printf("Ошибка БД при получении профиля: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при получении профиля"})
			return
		}
		c.JSON(http.StatusOK, u)
	})

	// Эндпоинт для получения пользователя по ID (для внутреннего использования Gateway)
	// Этот эндпоинт НЕ должен требовать токена, но должен быть доступен только внутри сети Docker.
	// В реальной системе тут должна быть какая-то другая форма аутентификации для сервисов (например, API Key).
	// Для простоты, оставим его без аутентификации, но помним, что это потенциальная уязвимость,
	// если сервис будет доступен извне сети.
	r.GET("/users/:id", func(c *gin.Context) {
		userIDStr := c.Param("id")
		userID, err := strconv.Atoi(userIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат ID пользователя"})
			return
		}

		var u User
		err = db.QueryRow(
			`SELECT id, full_name, email, phone, role, clinic_id, specialization
				 FROM users WHERE id = $1`,
			userID,
		).Scan(&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role, &u.ClinicID, &u.Specialization)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
				return
			}
			log.Printf("Ошибка БД при получении пользователя по ID: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка при получении данных пользователя"})
			return
		}
		// Возвращаем всю информацию, включая роль. Gateway возьмет то, что ему нужно.
		c.JSON(http.StatusOK, u)
	})

	/* -- остальные эндпоинты (пациенты, врачи, админ и т.д.) без изменений -- */

	if err := r.Run(":8080"); err != nil {
		log.Fatal("Ошибка запуска users_service:", err)
	}
}
