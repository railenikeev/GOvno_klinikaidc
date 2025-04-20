// src/services/profileService.js

const API_BASE = 'http://localhost:8000/api';
const tokenHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
});

// Получить профиль
export async function getProfile() {
    const res = await fetch(`${API_BASE}/profile`, {
        headers: tokenHeader(),
    });
    if (!res.ok) {
        throw new Error('Не удалось загрузить профиль');
    }
    return res.json();
}

// Обновить профиль
export async function updateProfile(data) {
    const res = await fetch(`${API_BASE}/profile`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...tokenHeader(),
        },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Ошибка при обновлении профиля');
    }
    return res.json();
}

// Сменить пароль
export async function changePassword({ currentPassword, newPassword }) {
    const res = await fetch(`${API_BASE}/profile/password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...tokenHeader(),
        },
        body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Ошибка при смене пароля');
    }
    return res.json();
}

// Получить настройки уведомлений
export async function getNotificationSettings() {
    const res = await fetch(`${API_BASE}/profile/notifications`, {
        headers: tokenHeader(),
    });
    if (!res.ok) {
        throw new Error('Не удалось загрузить настройки уведомлений');
    }
    return res.json(); // ожидаем { email: boolean, sms: boolean, push: boolean }
}

// Обновить настройки уведомлений
export async function updateNotificationSettings(settings) {
    const res = await fetch(`${API_BASE}/profile/notifications`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...tokenHeader(),
        },
        body: JSON.stringify(settings),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Ошибка при обновлении настроек уведомлений');
    }
    return res.json();
}
