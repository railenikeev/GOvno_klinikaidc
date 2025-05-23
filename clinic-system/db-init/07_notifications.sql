
CREATE TABLE IF NOT EXISTS notifications (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    channel     VARCHAR(50) NOT NULL,
    message     TEXT NOT NULL,
    sent_at     TIMESTAMP NOT NULL DEFAULT NOW()

);