
CREATE TABLE IF NOT EXISTS appointments (
   id                    SERIAL PRIMARY KEY,
   patient_id            INTEGER NOT NULL,
   doctor_schedule_id    INTEGER UNIQUE NOT NULL,
   status                VARCHAR(50) NOT NULL
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
    created_at            TIMESTAMP NOT NULL DEFAULT NOW()

);