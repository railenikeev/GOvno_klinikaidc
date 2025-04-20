// adminService.js
const API = '/api'

export async function getClinicStats() {
    const res = await fetch(`${API}/admin/stats`)
    if (!res.ok) throw new Error('Ошибка получения статистики')
    return res.json()
}

export async function getPatients() {
    const res = await fetch(`${API}/patients`)
    if (!res.ok) throw new Error('Ошибка получения пациентов')
    return res.json()
}

export async function getDoctors() {
    const res = await fetch(`${API}/doctors`)
    if (!res.ok) throw new Error('Ошибка получения врачей')
    return res.json()
}

export async function getAppointments() {
    const res = await fetch(`${API}/appointments`)
    if (!res.ok) throw new Error('Ошибка получения записей')
    return res.json()
}

export async function getPayments() {
    const res = await fetch(`${API}/payments`)
    if (!res.ok) throw new Error('Ошибка получения платежей')
    return res.json()
}

/**
 * Добавить врача: передаём ID существующего пользователя и специализацию.
 * Бекенд должен привязать пользователя к текущей клинике и поменять роль на "doctor".
 */
export async function addDoctor({ userId, specialization }) {
    const res = await fetch(`${API}/doctors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, specialization }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Ошибка добавления врача')
    }
    return res.json()
}

export async function updateDoctor(id, data) {
    const res = await fetch(`${API}/doctors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Ошибка обновления врача')
    }
    return res.json()
}

export async function deleteDoctor(id) {
    const res = await fetch(`${API}/doctors/${id}`, {
        method: 'DELETE',
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Ошибка удаления врача')
    }
}
