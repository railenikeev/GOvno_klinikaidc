// frontend/src/services/appointmentService.js

const API = '/api'
function authHeaders() {
    const token  = localStorage.getItem('token')
    const userId = localStorage.getItem('user_id')
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-User-ID':    userId,
    }
}


// Fetch all appointments for the logged-in doctor
export async function getMyAppointments() {
    const res = await fetch(`${API}/appointments/my`, {
        headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Не удалось загрузить записи');
    return res.json();
}

// Update status (confirmed / canceled / etc.) of a single appointment
export async function updateAppointmentStatus(appointmentId, status) {
    const res = await fetch(`${API}/appointments/${appointmentId}/status`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Не удалось обновить статус записи');
    return res.json();
}

// Fetch my slots
export async function getMySlots() {
    const res = await fetch(`${API}/schedules/my`, {
        headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Не удалось загрузить слоты');
    return res.json();
}

// Create a new slot
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
