// src/services/bookingService.js
const API = '/api';

function authHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };
}

/* ──────────── города и клиники ──────────── */

export async function fetchCities() {
    const res = await fetch(`${API}/cities`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Не удалось загрузить города');
    return res.json();
}

export async function fetchClinics(city) {
    const res = await fetch(
        `${API}/clinics?city=${encodeURIComponent(city)}`,
        { headers: authHeaders() },
    );
    if (!res.ok) throw new Error('Не удалось загрузить клиники');
    return res.json();
}

/* ──────────── ВРАЧИ ──────────── */
// ★ исправленный энд-поинт
export async function fetchDoctors(clinicId) {
    const res = await fetch(
        `${API}/users/doctors?clinic_id=${clinicId}`,
        { headers: authHeaders() },
    );
    if (!res.ok) throw new Error('Не удалось загрузить врачей');
    return res.json();
}

/* ──────────── свободные слоты ──────────── */

export async function fetchAvailableTimes(doctorId, date) {
    const res = await fetch(
        `${API}/schedules/available?doctor_id=${doctorId}&date=${date}`,
        { headers: authHeaders() },
    );
    if (!res.ok) throw new Error('Не удалось загрузить свободные слоты');
    return res.json();
}

/* ──────────── запись ──────────── */

export async function createAppointment({ doctor_id, date, time }) {
    const res = await fetch(`${API}/appointments`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ doctor_id, date, time }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Вы записаны');
    }
    return res.json();
}
