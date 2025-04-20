CREATE TABLE IF NOT EXISTS medical_records (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER,
    doctor_id INTEGER,
    appointment_id INTEGER,
    diagnosis TEXT,
    treatment TEXT,
    visit_date DATE
);
