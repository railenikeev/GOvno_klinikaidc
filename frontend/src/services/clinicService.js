// frontend/src/services/clinicService.js
const API = '/api'

async function request(path, opts = {}) {
    const token = localStorage.getItem('token')

    const res = await fetch(`${API}${path}`, {
        ...opts,
        headers: {
            ...(opts.headers || {}),
            Authorization: `Bearer ${token}`,
        },
    })

    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Ошибка ${res.status}`)
    }

    if (res.status === 204) return null
    return res.json()
}

/* ────────── CRUD клиник ────────── */

export const getClinics = () => request('/clinics')

export const createClinic = data =>
    request('/clinics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    })

export const updateClinic = (clinicId, data) =>
    request(`/clinics/${clinicId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    })

export const deleteClinic = clinicId =>
    request(`/clinics/${clinicId}`, { method: 'DELETE' })

/* ────────── назначить администратора ────────── */

export const assignClinicAdmin = (clinicId, userId) =>
    request(`/clinics/${clinicId}/assign-admin`, {
        method: 'PATCH',                    // ← backend ждёт PATCH
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),   // ← backend ждёт поле userId
    })
