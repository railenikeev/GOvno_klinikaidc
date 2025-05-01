-- Создание таблицы записей на прием

CREATE TABLE IF NOT EXISTS appointments (
   id                    SERIAL PRIMARY KEY,         -- Уникальный идентификатор записи
   patient_id            INTEGER NOT NULL,           -- ID пациента (ссылка на users.id)
   doctor_schedule_id    INTEGER UNIQUE NOT NULL,    -- ID слота врача (ссылка на doctor_schedules.id)
    -- UNIQUE гарантирует, что на один слот может быть только одна запись
   status                VARCHAR(50) NOT NULL        -- Статус записи: 'scheduled', 'completed', 'cancelled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')), -- Ограничение на возможные статусы
    created_at            TIMESTAMP NOT NULL DEFAULT NOW() -- Дата и время создания записи

-- Внешние ключи для patient_id и doctor_schedule_id будут добавлены
-- в отдельном файле (например, 99_foreign_keys.sql).
);

-- Комментарий: Поле slot_id заменено на doctor_schedule_id и теперь ссылается на таблицу doctor_schedules.
-- Комментарий: Добавлено ограничение UNIQUE на doctor_schedule_id.
-- Комментарий: Добавлены ограничения NOT NULL и CHECK для status, NOT NULL и DEFAULT для created_at.

-- Можно добавить индекс для быстрого поиска записей по пациенту или статусу
-- CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);
-- CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);