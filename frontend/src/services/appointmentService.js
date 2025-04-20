// src/services/appointmentService.js

const API = 'http://localhost:8000/api/appointments';
const token = () => localStorage.getItem('token');

// Получить список приёмов "моего" доктора
export async function getMyAppointments() {
    const res = await fetch(`${API}/my`, {
        headers: { Authorization: `Bearer ${token()}` },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Не удалось загрузить приёмы');
    }
    return res.json();
}

// Обновить приём (статус, комментарий…)
export async function updateAppointment(id, data) {
    const res = await fetch(`${API}/${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка обновления');
    }
    return res.json();
}

// Отменить приём
export async function cancelAppointment(id) {
    const res = await fetch(`${API}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка отмены');
    }
}
