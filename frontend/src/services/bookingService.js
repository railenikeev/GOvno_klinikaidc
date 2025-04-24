// src/services/bookingService.js
// ------------------------------------
const API = '/api';

/* Утилита для добавления JWT-токена */
function authHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };
}

/* ↓↓↓ 1. Города (опционально, если нужны) */
export async function fetchCities() {
    const res = await fetch(`${API}/cities`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Не удалось загрузить города');
    return res.json();
}

/* ↓↓↓ 2. КЛИНИКИ ---------------------------------------------------- */
/* исходная функция */
export async function fetchClinics(city) {
    const res = await fetch(
        `${API}/clinics?city=${encodeURIComponent(city)}`,
        { headers: authHeaders() },
    );
    if (!res.ok) throw new Error('Не удалось загрузить клиники');
    return res.json();
}
/* алиас для BookingWizard */
export const getClinics = fetchClinics;

/* ↓↓↓ 3. ВРАЧИ ------------------------------------------------------ */
export async function fetchDoctors(clinicId) {
    const res = await fetch(
        `${API}/doctors?clinic_id=${clinicId}`,
        { headers: authHeaders() },
    );
    if (!res.ok) throw new Error('Не удалось загрузить врачей');
    return res.json();
}
export const getDoctors = fetchDoctors;

/* ↓↓↓ 4. СВОБОДНЫЕ СЛОТЫ/РАСПИСАНИЕ -------------------------------- */
/**
 * Возвращает массив свободных временных слотов врача.
 *  doctorId — ID врача
 *  date      — строка YYYY-MM-DD (необязательна; если не передать, берётся сегодня)
 */
export async function fetchAvailableTimes(doctorId, date = new Date().toISOString().slice(0, 10)) {
    const res = await fetch(
        `${API}/schedules/available?doctor_id=${doctorId}&date=${date}`,
        { headers: authHeaders() },
    );
    if (!res.ok) throw new Error('Не удалось загрузить свободные слоты');
    return res.json();
}
/* alias, который ожидает BookingWizard */
export const getSchedule = fetchAvailableTimes;

/* ↓↓↓ 5. СОЗДАНИЕ ЗАПИСИ ------------------------------------------- */
/**
 * createAppointment({ slotId })
 *  slotId — идентификатор выбранного слота расписания
 */
export async function createAppointment({ slotId }) {
    const res = await fetch(`${API}/appointments`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ slot_id: slotId }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка при создании записи');
    }
    return res.json();
}

/* старый вариант (с doctor_id / date / time) оставил на случай,
   если его вызывают где-то ещё */
