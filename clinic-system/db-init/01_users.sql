-- Создание таблицы пользователей (пациенты, врачи, администраторы)
-- Версия для модели одной клиники

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,                      -- Уникальный идентификатор пользователя
    full_name       VARCHAR(255) NOT NULL,                   -- Полное имя пользователя
    email           VARCHAR(255) UNIQUE NOT NULL,            -- Email (логин), должен быть уникальным
    password_hash   VARCHAR(255) NOT NULL,                   -- Хеш пароля
    phone           VARCHAR(20) UNIQUE NOT NULL,             -- Номер телефона, должен быть уникальным (увеличил длину для гибкости)
    role            VARCHAR(50) NOT NULL                     -- Роль пользователя: 'patient', 'doctor', 'admin'
    CHECK (role IN ('patient', 'doctor', 'admin')), -- Ограничение на возможные роли
    specialization_id INTEGER NULL                           -- ID специализации врача (ссылка на specializations.id)
-- NULL для пациентов и администраторов
-- Внешний ключ для specialization_id будет добавлен в отдельном файле (например, 99_foreign_keys.sql)
-- чтобы избежать проблем с порядком создания таблиц.
);

-- Комментарий: Таблица clinics и поле clinic_id удалены для модели одной клиники.
-- Комментарий: Поле specialization заменено на specialization_id (INTEGER).

-- Можно добавить индексы для часто используемых полей, если потребуется оптимизация
-- CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
-- CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);