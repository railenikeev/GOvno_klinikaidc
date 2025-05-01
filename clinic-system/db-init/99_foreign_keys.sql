-- Добавление внешних ключей (Foreign Keys) после создания всех таблиц

-- Связь пользователя-врача со специализацией
ALTER TABLE users
    ADD CONSTRAINT fk_users_specialization
        FOREIGN KEY (specialization_id) REFERENCES specializations(id)
            ON DELETE SET NULL -- Если специализацию удалят, у врача поле станет NULL
            ON UPDATE CASCADE;  -- Если ID специализации изменится, обновить у врача

-- Связь слота расписания с врачом
ALTER TABLE doctor_schedules
    ADD CONSTRAINT fk_schedule_doctor
        FOREIGN KEY (doctor_id) REFERENCES users(id)
            ON DELETE CASCADE  -- Если врача удалят, удалить его слоты расписания
            ON UPDATE CASCADE;

-- Связь записи на прием с пациентом
ALTER TABLE appointments
    ADD CONSTRAINT fk_appointment_patient
        FOREIGN KEY (patient_id) REFERENCES users(id)
            ON DELETE CASCADE  -- Если пациента удалят, удалить его записи на прием
            ON UPDATE CASCADE;

-- Связь записи на прием со слотом расписания
ALTER TABLE appointments
    ADD CONSTRAINT fk_appointment_schedule
        FOREIGN KEY (doctor_schedule_id) REFERENCES doctor_schedules(id)
            ON DELETE CASCADE  -- Если слот удалят, удалить запись на прием
            ON UPDATE CASCADE;

-- Связь медкарты с пациентом
ALTER TABLE medical_records
    ADD CONSTRAINT fk_medrec_patient
        FOREIGN KEY (patient_id) REFERENCES users(id)
            ON DELETE CASCADE  -- Если пациента удалят, удалить его медкарты
            ON UPDATE CASCADE;

-- Связь медкарты с врачом
ALTER TABLE medical_records
    ADD CONSTRAINT fk_medrec_doctor
        FOREIGN KEY (doctor_id) REFERENCES users(id)
            ON DELETE RESTRICT -- Запретить удаление врача, если у него есть записи в медкартах
            -- (Можно заменить на SET NULL, если это допустимо)
            ON UPDATE CASCADE;

-- Связь медкарты с записью на прием
ALTER TABLE medical_records
    ADD CONSTRAINT fk_medrec_appointment
        FOREIGN KEY (appointment_id) REFERENCES appointments(id)
            ON DELETE CASCADE  -- Если запись на прием удалят, удалить медкарту
            ON UPDATE CASCADE;

-- Связь платежа с записью на прием
ALTER TABLE payments
    ADD CONSTRAINT fk_payment_appointment
        FOREIGN KEY (appointment_id) REFERENCES appointments(id)
            ON DELETE CASCADE  -- Если запись на прием удалят, удалить платеж
            ON UPDATE CASCADE;

-- Связь уведомления с пользователем
ALTER TABLE notifications
    ADD CONSTRAINT fk_notification_user
        FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE  -- Если пользователя удалят, удалить его уведомления
            ON UPDATE CASCADE;