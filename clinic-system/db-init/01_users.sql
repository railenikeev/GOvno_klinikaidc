CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(255),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255),
    phone           VARCHAR(11) UNIQUE NOT NULL,
    role            VARCHAR(50),
    clinic_id       INTEGER REFERENCES clinics(id),
    specialization  VARCHAR(100)
);
