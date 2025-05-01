-- Создание таблицы электронных медицинских карт (записей о приемах)

CREATE TABLE IF NOT EXISTS medical_records (
   id              SERIAL PRIMARY KEY,         -- Уникальный идентификатор записи ЭМК
   patient_id      INTEGER NOT NULL,           -- ID пациента (ссылка на users.id)
   doctor_id       INTEGER NOT NULL,           -- ID врача (ссылка на users.id)
   appointment_id  INTEGER UNIQUE NOT NULL,    -- ID записи на прием, к которой относится эта медкарта
    -- UNIQUE гарантирует одну запись ЭМК на один прием
   diagnosis       TEXT NULL,                  -- Поставленный диагноз (может быть не заполнен сразу)
   treatment       TEXT NULL,                  -- Назначенное лечение (может быть не заполнено сразу)
   visit_date      DATE NOT NULL               -- Дата фактического визита/приема

    -- Внешние ключи для patient_id, doctor_id, appointment_id будут добавлены
    -- в отдельном файле (например, 99_foreign_keys.sql).
);

-- Комментарий: Убедитесь, что типы данных и названия полей соответствуют финальной схеме.
-- Комментарий: Добавлено UNIQUE NOT NULL для appointment_id.
-- Комментарий: diagnosis и treatment сделаны NULLABLE. visit_date сделано NOT NULL.

-- Можно добавить индексы для поиска по пациенту или врачу
-- CREATE INDEX IF NOT EXISTS idx_medical_records_patient_id ON medical_records(patient_id);
-- CREATE INDEX IF NOT EXISTS idx_medical_records_doctor_id ON medical_records(doctor_id);