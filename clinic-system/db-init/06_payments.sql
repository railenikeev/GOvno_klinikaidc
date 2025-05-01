-- Создание таблицы платежей

CREATE TABLE IF NOT EXISTS payments (
    id              SERIAL PRIMARY KEY,         -- Уникальный идентификатор платежа
    appointment_id  INTEGER UNIQUE NOT NULL,    -- ID записи на прием, за которую произведен платеж
    amount          NUMERIC(10, 2) NOT NULL,    -- Сумма платежа (используем NUMERIC/DECIMAL для денег)
    payment_date    TIMESTAMP NULL,             -- Фактическая дата и время платежа (может быть NULL, если статус 'pending')
    payment_status  VARCHAR(50) NOT NULL        -- Статус платежа: 'pending', 'paid', 'failed'
    CHECK (payment_status IN ('pending', 'paid', 'failed')) -- Ограничение на возможные статусы

-- Внешний ключ для appointment_id будет добавлен в отдельном файле (например, 99_foreign_keys.sql).
);

-- Комментарий: Старые таблицы transactions и receipts удалены.
-- Комментарий: Создана таблица payments согласно финальной схеме.
-- Комментарий: Добавлены ограничения UNIQUE, NOT NULL, CHECK.