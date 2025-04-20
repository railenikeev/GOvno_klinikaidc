const BASE_URL = 'http://localhost:8000/api';

const headers = () => {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };
};

export async function fetchCities() {
    const res = await fetch(`${BASE_URL}/cities`, { headers: headers() });
    return res.json();
}

export async function fetchClinics(city) {
    const res = await fetch(`${BASE_URL}/clinics?city=${encodeURIComponent(city)}`, {
        headers: headers(),
    });
    return res.json();
}

export async function fetchDoctors(clinicId) {
    const res = await fetch(`${BASE_URL}/doctors?clinic_id=${clinicId}`, {
        headers: headers(),
    });
    return res.json();
}

export async function fetchAvailableTimes(doctorId, date) {
    const res = await fetch(`${BASE_URL}/schedules/available?doctor_id=${doctorId}&date=${date}`, {
        headers: headers(),
    });
    return res.json();
}

export async function createAppointment({ doctor_id, date, time }) {
    const res = await fetch(`${BASE_URL}/appointments`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ doctor_id, date, time }),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Ошибка при записи');
    }

    return res.json();
}
