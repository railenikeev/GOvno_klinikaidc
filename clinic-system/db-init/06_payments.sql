
CREATE TABLE IF NOT EXISTS payments (
    id              SERIAL PRIMARY KEY,
    appointment_id  INTEGER UNIQUE NOT NULL,
    amount          NUMERIC(10, 2) NOT NULL,
    payment_date    TIMESTAMP NULL,
    payment_status  VARCHAR(50) NOT NULL
    CHECK (payment_status IN ('pending', 'paid', 'failed'))

);