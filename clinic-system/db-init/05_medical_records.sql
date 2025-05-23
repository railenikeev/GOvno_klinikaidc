
CREATE TABLE IF NOT EXISTS medical_records (
   id              SERIAL PRIMARY KEY,
   patient_id      INTEGER NOT NULL,
   doctor_id       INTEGER NOT NULL,
   appointment_id  INTEGER UNIQUE NOT NULL,
   diagnosis       TEXT NULL,
   treatment       TEXT NULL,
   visit_date      DATE NOT NULL

);