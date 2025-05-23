
ALTER TABLE users
    ADD CONSTRAINT fk_users_specialization
        FOREIGN KEY (specialization_id) REFERENCES specializations(id)
            ON DELETE SET NULL
            ON UPDATE CASCADE;

ALTER TABLE doctor_schedules
    ADD CONSTRAINT fk_schedule_doctor
        FOREIGN KEY (doctor_id) REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE;

ALTER TABLE appointments
    ADD CONSTRAINT fk_appointment_patient
        FOREIGN KEY (patient_id) REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE;

ALTER TABLE appointments
    ADD CONSTRAINT fk_appointment_schedule
        FOREIGN KEY (doctor_schedule_id) REFERENCES doctor_schedules(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE;

-- Связь медкарты с пациентом
ALTER TABLE medical_records
    ADD CONSTRAINT fk_medrec_patient
        FOREIGN KEY (patient_id) REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE;

-- Связь медкарты с врачом
ALTER TABLE medical_records
    ADD CONSTRAINT fk_medrec_doctor
        FOREIGN KEY (doctor_id) REFERENCES users(id)
            ON DELETE RESTRICT
            ON UPDATE CASCADE;

ALTER TABLE medical_records
    ADD CONSTRAINT fk_medrec_appointment
        FOREIGN KEY (appointment_id) REFERENCES appointments(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE;

ALTER TABLE payments
    ADD CONSTRAINT fk_payment_appointment
        FOREIGN KEY (appointment_id) REFERENCES appointments(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE;

ALTER TABLE notifications
    ADD CONSTRAINT fk_notification_user
        FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE;