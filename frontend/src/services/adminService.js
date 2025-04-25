// frontend/src/services/adminService.js

const API_USERS = '/api/users'; // users-service через gateway
const API_APPOINT = '/api/appointments';
const API_PAYMENTS = '/api/payments';

// ――― вспомогательные ―――
function authHeaders() {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function jsonOrError(res, defaultMsg) {
    if (res.ok) return res.status === 204 ? null : res.json();
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || defaultMsg);
}

/* ------------------------------------------------------------------ */
/* СТАТИСТИКА */
/* ------------------------------------------------------------------ */
export async function getClinicStats() {
    const res = await fetch(`${API_USERS}/admin/stats`, {
        headers: authHeaders(),
    });
    return jsonOrError(res, 'Ошибка получения статистики');
}

/* ------------------------------------------------------------------ */
/* ПАЦИЕНТЫ */
/* ------------------------------------------------------------------ */
export async function getPatients() {
    const res = await fetch(`${API_USERS}/admin/patients`, {
        headers: authHeaders(),
    });
    return jsonOrError(res, 'Ошибка получения пациентов');
}

/* ------------------------------------------------------------------ */
/* ВРАЧИ */
/* ------------------------------------------------------------------ */
export async function getDoctors() {
    const res = await fetch(`${API_USERS}/doctors`, {
        headers: authHeaders(),
    });
    // если сервис вернул 204 No Content — возвращаем пустой список
    if (res.status === 204) {
        return [];
    }
    return jsonOrError(res, 'Ошибка получения врачей');
}

export async function getDoctor(id) {
    const res = await fetch(`${API_USERS}/doctors/${id}`, {
        headers: authHeaders(),
    });
    return jsonOrError(res, 'Ошибка получения врача');
}

export async function addDoctor({ userId, specialization }) {
    const res = await fetch(`${API_USERS}/doctors`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
        },
        body: JSON.stringify({ userId, specialization }),
    });
    // users-service отвечает 204 No Content при успехе
    if (res.status === 204) return getDoctor(userId);
    return jsonOrError(res, 'Ошибка добавления врача');
}

export async function updateDoctor(id, data) {
    const res = await fetch(`${API_USERS}/doctors/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
        },
        body: JSON.stringify(data),
    });
    return jsonOrError(res, 'Ошибка обновления врача');
}

export async function deleteDoctor(id) {
    const res = await fetch(`${API_USERS}/doctors/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    return jsonOrError(res, 'Ошибка удаления врача');
}

/* ------------------------------------------------------------------ */
/* ЗАПИСИ и ПЛАТЕЖИ */
/* ------------------------------------------------------------------ */
export async function getAppointments() {
    const res = await fetch(API_APPOINT, { headers: authHeaders() });
    return jsonOrError(res, 'Ошибка получения записей');
}

export async function getPayments() {
    const res = await fetch(API_PAYMENTS, { headers: authHeaders() });
    return jsonOrError(res, 'Ошибка получения платежей');
}

export async function getSchedule() {
    // Пока микросервис расписаний не подключён,
    // вернём пустой массив, чтобы компонент не падал.
    return [];
}
