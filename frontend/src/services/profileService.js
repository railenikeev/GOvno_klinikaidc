// frontend/src/services/profileService.js
const API = 'http://localhost:8000/api'; // <-- обратите внимание: не /api/users, а именно /api

async function request(path, opts = {}) {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}${path}`, {
        ...opts,
        headers: {
            ...(opts.headers || {}),
            Authorization: `Bearer ${token}`
        }
    });

    if (!res.ok) {
        // прочитать тело как текст (может быть HTML) и бросить
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || `Ошибка ${res.status}`);
    }

    // если код 204 — вернуть null
    if (res.status === 204) return null;

    // парсим JSON, а при ошибке — выдаём понятную ошибку
    try {
        return await res.json();
    } catch {
        throw new Error('Невалидный JSON в ответе от сервера');
    }
}

export function getProfile() {
    // теперь это сделает GET /api/users/profile
    return request('/users/profile');
}

export function updateProfile(data) {
    // PUT /api/users/profile
    return request('/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
}

export function changePassword(data) {
    // POST /api/users/password
    return request('/users/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
}

export function getNotificationSettings() {
    // GET /api/users/notifications
    return request('/users/notifications');
}

export function updateNotificationSettings(data) {
    // PUT /api/users/notifications
    return request('/users/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
}
