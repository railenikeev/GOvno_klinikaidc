// src/services/authService.js

const API = '/api/users';

async function request(path, opts = {}) {
    const res = await fetch(`${API}${path}`, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            ...(opts.headers || {}),
        },
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Ошибка ${res.status}`);
    }

    // если возвращается пустой ответ
    if (res.status === 204) return null;
    return res.json();
}

// POST /api/users/login
export function login(email, password) {
    return request('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    }).then(data => data.token);
}

// POST /api/users/register
export function register({ fullName, email, password, phone }) {
    return request('/register', {
        method: 'POST',
        body: JSON.stringify({
            full_name: fullName,
            email,
            password,
            phone,
            role: 'patient',
            clinic_id: null,
        }),
    });
}

// PATCH /api/users/me
export function updateProfile(data) {
    const token = localStorage.getItem('token');
    return request('/me', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
    });
}
