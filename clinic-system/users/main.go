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
	_ "github.com/lib/pq" // Драйвер PostgreSQL
	"golang.org/x/crypto/bcrypt"
)

/* ──────────────── Модели ──────────────── */

// User - основная структура пользователя для JSON ответов
type User struct {
	ID                 int     `json:"id"`
	FullName           string  `json:"full_name"`
	Email              string  `json:"email"`
	Phone              string  `json:"phone"`
	Role               string  `json:"role"`
	SpecializationID   *int    `json:"specialization_id,omitempty"`   // ID специализации (только для врачей)
	SpecializationName *string `json:"specialization_name,omitempty"` // Название специализации (для отображения)
	// ClinicID удалено
}

/* ──────────────── JWT ──────────────── */

var jwtSecret = []byte(os.Getenv("JWT_SECRET")) // Секрет из переменной окружения

func init() {
	if len(jwtSecret) == 0 {
		log.Println("ПРЕДУПРЕЖДЕНИЕ: Переменная окружения JWT_SECRET не установлена, используется значение по умолчанию 'supersecret'.")
		jwtSecret = []byte("supersecret") // Значение по умолчанию
	}
}

// extractUserIDFromToken извлекает ID пользователя из токена
func extractUserIDFromToken(tokenStr string) (int, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("неожиданный метод подписи: %v", t.Header["alg"])
		}
		return jwtSecret, nil
	})
	if err != nil || !token.Valid {
		log.Printf("Ошибка валидации токена: %v", err)
		return 0, errors.New("некорректный или просроченный токен")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, errors.New("неверный формат claims в токене")
	}
	rawUserID, ok := claims["user_id"]
	if !ok {
		return 0, errors.New("user_id не найден в токене")
	}
	userIDFloat, ok := rawUserID.(float64)
	if !ok {
		return 0, errors.New("user_id в токене не является числом")
	}
	return int(userIDFloat), nil
}

/* ──────────────── Main ──────────────── */

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("Переменная окружения DATABASE_URL не задана")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Ошибка подключения к БД: %v", err)
	}
	defer db.Close()

	// Проверка соединения
	if err = db.Ping(); err != nil {
		log.Fatalf("Ошибка пинга БД: %v", err)
	}
	log.Println("Успешное подключение к БД!")

	r := gin.Default()

	/* ---------- Регистрация ---------- */
	r.POST("/register", func(c *gin.Context) {
		var req struct {
			FullName         string `json:"full_name" binding:"required"`
			Email            string `json:"email" binding:"required,email"`
			Password         string `json:"password" binding:"required,min=6"`
			Phone            string `json:"phone" binding:"required"`                           // Сделаем телефон обязательным
			Role             string `json:"role" binding:"required,oneof=patient doctor admin"` // Обновленные роли
			SpecializationID *int   `json:"specialization_id"`                                  // Теперь ID, необязательное поле
			// ClinicID удален
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}

		// Проверка: если роль 'doctor', то specialization_id должен быть указан
		if req.Role == "doctor" && req.SpecializationID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Для роли 'doctor' требуется указать specialization_id"})
			return
		}
		// Если роль не 'doctor', specialization_id должен быть nil (игнорируем переданное значение)
		if req.Role != "doctor" {
			req.SpecializationID = nil
		}

		// Хэшируем пароль
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("Ошибка при хэшировании пароля: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Внутренняя ошибка сервера"})
			return
		}

		// Вставляем пользователя в таблицу users
		var userID int
		err = db.QueryRow(
			`INSERT INTO users (full_name, email, password_hash, phone, role, specialization_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
			req.FullName, req.Email, string(hash), req.Phone, req.Role, req.SpecializationID, // Используем specialization_id
		).Scan(&userID)

		if err != nil {
			// Проверка на UNIQUE constraint (например, email или телефон уже занят)
			// Конкретный текст ошибки зависит от драйвера PostgreSQL
			if strings.Contains(err.Error(), "duplicate key value violates unique constraint") {
				errorMessage := "Пользователь с таким email или телефоном уже существует"
				if strings.Contains(err.Error(), "users_email_key") {
					errorMessage = "Пользователь с таким email уже существует"
				} else if strings.Contains(err.Error(), "users_phone_key") {
					errorMessage = "Пользователь с таким телефоном уже существует"
				}
				c.JSON(http.StatusConflict, gin.H{"error": errorMessage})
				return
			}
			log.Printf("Ошибка БД при регистрации пользователя: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при регистрации пользователя"})
			return
		}

		// Удалена вставка в отдельную таблицу doctors

		c.JSON(http.StatusCreated, gin.H{"id": userID, "message": "Пользователь успешно зарегистрирован"})
	})

	/* ---------- Вход ---------- */
	r.POST("/login", func(c *gin.Context) {
		var req struct {
			Email    string `json:"email" binding:"required,email"`
			Password string `json:"password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Неверный формат запроса: %v", err.Error())})
			return
		}

		var id int
		var hash string
		var role string
		err = db.QueryRow(
			`SELECT id, password_hash, role FROM users WHERE email = $1`,
			req.Email,
		).Scan(&id, &hash, &role)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Неверные учётные данные"})
				return
			}
			log.Printf("Ошибка БД при поиске пользователя: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Внутренняя ошибка сервера"})
			return
		}

		// Проверяем пароль
		err = bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password))
		if err != nil { // Неверный пароль или ошибка bcrypt
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Неверные учётные данные"})
			return
		}

		// Создаём JWT
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"user_id": id,
			"exp":     time.Now().Add(24 * time.Hour).Unix(), // Токен действует 24 часа
		})
		tokenString, err := token.SignedString(jwtSecret)
		if err != nil {
			log.Printf("Ошибка при подписании токена: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Внутренняя ошибка сервера"})
			return
		}

		// Возвращаем токен, ID пользователя и его роль
		c.JSON(http.StatusOK, gin.H{
			"token":   tokenString,
			"user_id": id,
			"role":    role,
		})
	})

	/* ---------- Middleware для аутентификации ---------- */
	authRequired := func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Отсутствует заголовок Authorization"})
			c.Abort()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Некорректный формат заголовка Authorization"})
			c.Abort()
			return
		}

		tokenStr := parts[1]
		userID, err := extractUserIDFromToken(tokenStr)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()}) // Используем ошибку из extractUserIDFromToken
			c.Abort()
			return
		}

		// Сохраняем ID пользователя в контексте Gin для использования в следующих обработчиках
		c.Set("userID", userID)
		c.Next()
	}

	/* ---------- Профиль текущего пользователя ---------- */
	r.GET("/me", authRequired, func(c *gin.Context) {
		userID, exists := c.Get("userID")
		if !exists {
			// Этого не должно произойти, если authRequired отработал корректно
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось получить userID из контекста"})
			return
		}

		// Используем userID для запроса данных пользователя
		var u User
		var specializationID sql.NullInt64    // Для сканирования nullable specialization_id
		var specializationName sql.NullString // Для сканирования nullable specialization name из JOIN

		// Обновленный запрос с LEFT JOIN для получения названия специализации
		query := `
            SELECT
                u.id, u.full_name, u.email, u.phone, u.role, u.specialization_id,
                s.name as specialization_name
            FROM users u
            LEFT JOIN specializations s ON u.specialization_id = s.id
            WHERE u.id = $1`

		err := db.QueryRow(query, userID.(int)).Scan(
			&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role,
			&specializationID,   // Сканируем в sql.NullInt64
			&specializationName, // Сканируем в sql.NullString
		)

		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
				return
			}
			log.Printf("Ошибка БД при получении профиля пользователя %d: %v", userID.(int), err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении профиля"})
			return
		}

		// Преобразуем nullable типы в указатели для JSON
		if specializationID.Valid {
			id := int(specializationID.Int64)
			u.SpecializationID = &id
		}
		if specializationName.Valid {
			name := specializationName.String
			u.SpecializationName = &name
		}

		c.JSON(http.StatusOK, u)
	})

	/* ---------- Получение пользователя по ID (для внутренних нужд Gateway) ---------- */
	r.GET("/users/:id", func(c *gin.Context) {
		// Важно: Этот эндпоинт не должен требовать токена пользователя,
		// так как его вызывает Gateway. Нужна защита на уровне сети или другим способом.
		userIDStr := c.Param("id")
		targetUserID, err := strconv.Atoi(userIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат ID пользователя"})
			return
		}

		var u User
		var specializationID sql.NullInt64
		var specializationName sql.NullString

		// Обновленный запрос с LEFT JOIN
		query := `
            SELECT
                u.id, u.full_name, u.email, u.phone, u.role, u.specialization_id,
                s.name as specialization_name
            FROM users u
            LEFT JOIN specializations s ON u.specialization_id = s.id
            WHERE u.id = $1`

		err = db.QueryRow(query, targetUserID).Scan(
			&u.ID, &u.FullName, &u.Email, &u.Phone, &u.Role,
			&specializationID,
			&specializationName,
		)

		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
				return
			}
			log.Printf("Ошибка БД при получении пользователя по ID %d: %v", targetUserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении данных пользователя"})
			return
		}

		// Преобразуем nullable типы в указатели для JSON
		if specializationID.Valid {
			id := int(specializationID.Int64)
			u.SpecializationID = &id
		}
		if specializationName.Valid {
			name := specializationName.String
			u.SpecializationName = &name
		}

		// Возвращаем все данные пользователя, включая роль и специализацию
		c.JSON(http.StatusOK, u)
	})

	/* -- Запуск сервера -- */
	port := ":8080" // Порт по умолчанию для сервиса пользователей
	log.Printf("Users service запущен на порту %s", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("Ошибка запуска Users service: %v", err)
	}
}
