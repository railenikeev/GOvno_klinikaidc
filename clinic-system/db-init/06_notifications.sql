CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    channel VARCHAR(50), -- email, sms, push
    message TEXT,
    sent_at TIMESTAMP DEFAULT NOW()
);
