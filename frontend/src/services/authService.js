// frontend/src/services/authService.js
// -------------------------------------

const API = '/api/users';

/* ──────────── helper ──────────── */

export function authHeaders() {
    const token = localStorage.getItem('token');
    return token
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        : { 'Content-Type': 'application/json' };
}

async function request(path, opts = {}) {
    const res = await fetch(`${API}${path}`, {
        ...opts,
        // заголовки из opts перекрывают базовые
        headers: { ...authHeaders(), ...(opts.headers || {}) },
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Ошибка ${res.status}`);
    }

    // 204 No-Content → null
    if (res.status === 204) return null;
    return res.json();
}

/* ──────────── auth ──────────── */

// POST /api/users/login
export function login(email, password) {
    return request('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    }).then(data => {
        localStorage.setItem('token', data.token)
        localStorage.setItem('user_id', data.user_id)
        return data
    })
}


// POST /api/users/register
export async function register({ fullName, email, password, phone }) {
    const user = await request('/register', {
        method: 'POST',
        body: JSON.stringify({
            full_name: fullName,
            email,
            password,
            phone,
            role: 'patient', // или 'doctor' — зависит от UI
            clinic_id: null, // пациенты без клиники
        }),
    });
    // many APIs сразу отдают токен после регистрации
    if (user.token && user.id) {
        localStorage.setItem('token',   user.token);
        localStorage.setItem('user_id', user.id);
    }
    return user;
}

// PATCH /api/users/me
export function updateProfile(data) {
    return request('/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
}
