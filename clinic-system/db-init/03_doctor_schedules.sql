-- Создание таблицы для слотов расписания врачей

CREATE TABLE IF NOT EXISTS doctor_schedules (
    id              SERIAL PRIMARY KEY,         -- Уникальный идентификатор слота
    doctor_id       INTEGER NOT NULL,           -- ID врача, к которому относится слот (ссылка на users.id)
    date            DATE NOT NULL,              -- Дата слота
    start_time      TIME NOT NULL,              -- Время начала слота
    end_time        TIME NOT NULL,              -- Время окончания слота
    is_available    BOOLEAN NOT NULL DEFAULT true, -- Доступен ли слот для записи (true - да, false - нет/занят)

    -- Ограничение: время окончания должно быть позже времени начала
    CHECK (end_time > start_time),

    -- Ограничение: комбинация врача, даты и времени начала должна быть уникальной,
    -- чтобы избежать дублирования слотов
    UNIQUE (doctor_id, date, start_time)

    -- Внешний ключ для doctor_id будет добавлен в отдельном файле (например, 99_foreign_keys.sql)
);

-- Можно добавить индекс для быстрого поиска слотов по врачу и дате
-- CREATE INDEX IF NOT EXISTS idx_doctor_schedules_doctor_date ON doctor_schedules(doctor_id, date);