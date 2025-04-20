const API_URL = 'http://localhost:8000/api/users';

export async function login(email, password) {
    const res = await fetch('http://localhost:8000/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Ошибка входа');
    }

    const data = await res.json();
    return data.token;
}

export async function register({ fullName, email, password, phone }) {
    const res = await fetch('http://localhost:8000/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            full_name: fullName,
            email,
            password,
            phone,
            role: 'patient',
            clinic_id: null,
        }),
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Ошибка регистрации');
    }

    const data = await res.json();
    return data;
}

export async function updateProfile(data) {
    const token = localStorage.getItem('token');

    const res = await fetch('http://localhost:8000/api/users/me', {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Ошибка обновления профиля');
    }

    return res.json();
}

