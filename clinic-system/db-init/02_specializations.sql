-- Создание таблицы специализаций врачей

CREATE TABLE IF NOT EXISTS specializations (
   id      SERIAL PRIMARY KEY,         -- Уникальный идентификатор специализации
   name    VARCHAR(100) UNIQUE NOT NULL -- Название специализации (например, 'Терапевт', 'Кардиолог')
-- Должно быть уникальным и не пустым
);

-- Можно добавить несколько базовых специализаций для примера
-- INSERT INTO specializations (name) VALUES ('Терапевт'), ('Кардиолог'), ('Невролог'), ('Окулист')
-- ON CONFLICT (name) DO NOTHING; -- Не добавлять, если уже существуют