CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    slot_id INTEGER REFERENCES schedule_slots(id),
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
