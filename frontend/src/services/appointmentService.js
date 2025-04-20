// src/services/appointmentService.js

const API = '/api/appointments'

async function request(path, { method, body, headers = {} } = {}) {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API}${path}`, {
        method,
        headers: {
            // если есть тело — ставим JSON-заголовок
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            Authorization: `Bearer ${token}`,
            ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Ошибка ${res.status}`)
    }

    // если нет контента
    if (res.status === 204) return null

    return res.json()
}

// GET /api/appointments/my — список приёмов текущего доктора
export function getMyAppointments() {
    return request('/my')
}

// PATCH /api/appointments/:id — обновить приём (статус, комментарий и т.д.)
export function updateAppointment(id, data) {
    return request(`/${id}`, { method: 'PATCH', body: data })
}

// DELETE /api/appointments/:id — отменить приём
export function cancelAppointment(id) {
    return request(`/${id}`, { method: 'DELETE' })
}
