// frontend/src/services/appointmentService.js
const API = '/api';

function authHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };
}

/* ──────────── APPOINTMENTS ──────────── */

// Забирает все записи текущего врача
export async function getMyAppointments() {
    const res = await fetch(`${API}/appointments/my`, {
        headers: authHeaders(),
    });
    if (!res.ok) {
        throw new Error('Не удалось загрузить записи');
    }
    return res.json();
}

// Меняет статус одной записи
export async function updateAppointmentStatus(appointmentId, status) {
    const res = await fetch(`${API}/appointments/${appointmentId}/status`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ status }),
    });
    if (!res.ok) {
        throw new Error('Не удалось обновить статус записи');
    }
    return res.json();
}

/* ──────────── SLOTS (Schedules) ──────────── */

// Забирает все слоты текущего врача
export async function getMySlots() {
    const res = await fetch(`${API}/schedules/my`, {
        headers: authHeaders(),
    });
    if (!res.ok) {
        throw new Error('Не удалось загрузить слоты');
    }
    return res.json();
}

// Создаёт новый слот
export async function createSlot({ date, start_time, end_time }) {
    const res = await fetch(`${API}/schedules`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ date, start_time, end_time }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка при создании слота');
    }
    return res.json();
}

// Удаляет слот по ID
export async function deleteSlot(slotId) {
    const res = await fetch(`${API}/schedules/${slotId}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Не удалось удалить слот');
    return null;
}
