// src/services/clinicService.js

const API = '/api';  // базовый путь

// Получить список всех клиник
export async function getClinics() {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/clinics`, {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });
    if (!res.ok) throw new Error('Ошибка загрузки клиник');
    return res.json();
}

// Создать новую клинику (с возможностью назначить админа сразу)
export async function createClinic({ city, name, address, phone, adminId }) {
    const token = localStorage.getItem('token');
    const body = { city, name, address, phone };
    if (adminId) body.adminId = adminId;  // опционально

    const res = await fetch(`${API}/clinics`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка создания клиники');
    }

    return res.json();
}

// Получить список всех пользователей (для назначения админа)
export async function getUsers() {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/users`, {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });
    if (!res.ok) throw new Error('Ошибка загрузки пользователей');
    return res.json();
}

// Назначить администратора для клиники
export async function assignClinicAdmin(clinicId, userId) {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/clinics/${clinicId}/assign-admin`, {
        method: 'PATCH', // ✅ PATCH — соответствует backend
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adminId: userId }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка назначения администратора');
    }

    return res.json();
}
