
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(255) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    phone           VARCHAR(20) UNIQUE NOT NULL,
    role            VARCHAR(50) NOT NULL
    CHECK (role IN ('patient', 'doctor', 'admin')),
    specialization_id INTEGER NULL

);