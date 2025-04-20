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

export function getClinics() {
    return request('/clinics')
}

export function createClinic(data) {
    return request('/clinics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    })
}

export function assignClinicAdmin(clinicId, userId) {
    return request(`/clinics/${clinicId}/assign-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: userId }),
    })
}

// **Новое**: удалить клинику
export function deleteClinic(clinicId) {
    return request(`/clinics/${clinicId}`, {
        method: 'DELETE',
    })
}

// **Новое**: обновить клинику
export function updateClinic(clinicId, data) {
    return request(`/clinics/${clinicId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    })
}
