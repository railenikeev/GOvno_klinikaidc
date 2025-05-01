-- Создание таблицы уведомлений

CREATE TABLE IF NOT EXISTS notifications (
    id          SERIAL PRIMARY KEY,         -- Уникальный идентификатор уведомления
    user_id     INTEGER NOT NULL,           -- ID пользователя-получателя (ссылка на users.id)
    channel     VARCHAR(50) NOT NULL,       -- Канал отправки (например, 'SYSTEM', 'EMAIL', 'SMS', 'PUSH')
-- В упрощенной версии может быть просто 'SYSTEM' или тип имитации
    message     TEXT NOT NULL,              -- Текст уведомления
    sent_at     TIMESTAMP NOT NULL DEFAULT NOW() -- Время "отправки" (создания записи)

-- Опционально: добавить поле для отметки о прочтении, если будет интерфейс для просмотра
-- , is_read     BOOLEAN NOT NULL DEFAULT false

-- Внешний ключ для user_id будет добавлен в отдельном файле (например, 99_foreign_keys.sql).
);

-- Комментарий: Добавлены ограничения NOT NULL к основным полям.
-- Комментарий: Значение по умолчанию для sent_at установлено в NOW().