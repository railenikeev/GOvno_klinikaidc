const API = '/api'

// Получить статистику по клинике
export async function getClinicStats() {
    const res = await fetch(`${API}/clinic/stats`)
    if (!res.ok) throw new Error('Не удалось загрузить статистику')
    return res.json()
}

// Получить список пациентов
export async function getPatients() {
    const res = await fetch(`${API}/clinic/patients`)
    if (!res.ok) throw new Error('Не удалось загрузить список пациентов')
    return res.json()
}

// Получить список врачей
export async function getDoctors() {
    const res = await fetch(`${API}/clinic/doctors`)
    if (!res.ok) throw new Error('Не удалось загрузить список врачей')
    return res.json()
}

// Получить список записей
export async function getAppointments() {
    const res = await fetch(`${API}/clinic/appointments`)
    if (!res.ok) throw new Error('Не удалось загрузить список записей')
    return res.json()
}

// Получить список платежей
export async function getPayments() {
    const res = await fetch(`${API}/clinic/payments`)
    if (!res.ok) throw new Error('Не удалось загрузить список платежей')
    return res.json()
}

// Добавить врача по ID с указанием специализации
export async function addDoctor(userId, specialization) {
    const res = await fetch(`${API}/clinic/doctors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, specialization }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || 'Не удалось добавить врача')
    }
    return res.json()
}
