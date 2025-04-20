CREATE TABLE IF NOT EXISTS doctors (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255),
    specialty VARCHAR(100),
    clinic_id INTEGER
);

CREATE TABLE IF NOT EXISTS schedule_slots (
    id SERIAL PRIMARY KEY,
    doctor_id INTEGER REFERENCES doctors(id),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    is_available BOOLEAN DEFAULT true
);
