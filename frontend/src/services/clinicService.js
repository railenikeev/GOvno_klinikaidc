// src/services/clinicService.js
const GATEWAY = 'http://localhost:8000/api'

// GET /api/clinics
export async function getClinics() {
    const token = localStorage.getItem('token')
    const res = await fetch(`${GATEWAY}/clinics`, {
        headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error('Ошибка загрузки клиник')
    return res.json()
}

// POST /api/clinics
export async function createClinic({ city, name, address, phone, adminId }) {
    const token = localStorage.getItem('token')
    const body = { city, name, address, phone }
    if (adminId) body.adminId = adminId

    const res = await fetch(`${GATEWAY}/clinics`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Ошибка создания клиники')
    }
    return res.json()
}

// PATCH /api/clinics/:id/assign-admin
export async function assignClinicAdmin(clinicId, userId) {
    const token = localStorage.getItem('token')
    const res = await fetch(`${GATEWAY}/clinics/${clinicId}/assign-admin`, {
        method: 'POST', // or PATCH
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ adminId: userId }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Ошибка назначения администратора')
    }
    return res.json()
}

// GET /api/users
export async function getUsers() {
    const token = localStorage.getItem('token')
    const res = await fetch('http://localhost:8000/api/users', {
        headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error('Ошибка загрузки пользователей')
    return res.json()
}
