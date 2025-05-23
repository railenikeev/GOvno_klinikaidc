
CREATE TABLE IF NOT EXISTS doctor_schedules (
    id              SERIAL PRIMARY KEY,
    doctor_id       INTEGER NOT NULL,
    date            DATE NOT NULL,
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    is_available    BOOLEAN NOT NULL DEFAULT true,

    CHECK (end_time > start_time),

    UNIQUE (doctor_id, date, start_time)

);