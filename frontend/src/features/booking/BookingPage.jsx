import React, { useEffect, useState } from 'react';
import {
    fetchCities,
    fetchClinics,
    fetchDoctors,
    fetchAvailableTimes,
    createAppointment,
} from '../../services/bookingService';

export default function BookingPage() {
    const [cities, setCities] = useState([]);
    const [clinics, setClinics] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [times, setTimes] = useState([]);

    const [selected, setSelected] = useState({
        city: '',
        clinic: '',
        doctor: '',
        date: '',
        time: '',
    });

    const [loading, setLoading] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        fetchCities().then(setCities).catch(() => alert('Ошибка загрузки городов'));
    }, []);

    useEffect(() => {
        if (!selected.city) return;
        fetchClinics(selected.city).then(setClinics).catch(() => alert('Ошибка загрузки клиник'));
    }, [selected.city]);

    useEffect(() => {
        if (!selected.clinic) return;
        fetchDoctors(selected.clinic).then(setDoctors).catch(() => alert('Ошибка загрузки врачей'));
    }, [selected.clinic]);

    useEffect(() => {
        if (!selected.doctor || !selected.date) return;
        fetchAvailableTimes(selected.doctor, selected.date)
            .then(setTimes)
            .catch(() => alert('Ошибка загрузки времени'));
    }, [selected.doctor, selected.date]);

    const handleChange = (field) => (e) => {
        setSelected((prev) => ({
            ...prev,
            [field]: e.target.value,
            ...(field !== 'time' && { time: '' }),
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setShowConfirm(true);
    };

    const confirmBooking = async () => {
        setShowConfirm(false);
        setLoading(true);
        try {
            await createAppointment({
                doctor_id: selected.doctor,
                date: selected.date,
                time: selected.time,
            });
            alert('Вы успешно записались!');
            setSelected({ city: '', clinic: '', doctor: '', date: '', time: '' });
        } catch (err) {
            alert('Ошибка: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-128px)] bg-gray-950 text-gray-200 font-mono px-4 py-12 flex justify-center items-center">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-lg bg-gray-800/60 backdrop-blur-sm border border-gray-700 rounded-2xl shadow-xl p-8 space-y-6"
            >
                <h2 className="text-2xl font-bold text-purple-400 text-center">📅 Запись на приём</h2>

                <Select
                    label="Город"
                    placeholder="Выберите город"
                    value={selected.city}
                    onChange={handleChange('city')}
                    options={cities}
                />
                <Select
                    label="Клиника"
                    placeholder="Выберите клинику"
                    value={selected.clinic}
                    onChange={handleChange('clinic')}
                    options={clinics}
                />
                <Select
                    label="Врач"
                    placeholder="Выберите врача"
                    value={selected.doctor}
                    onChange={handleChange('doctor')}
                    options={doctors}
                />

                <div className="space-y-1">
                    <label className="text-sm text-gray-400">Дата</label>
                    <input
                        type="date"
                        value={selected.date}
                        onChange={handleChange('date')}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        required
                    />
                </div>

                <Select
                    label="Время"
                    placeholder="Выберите время"
                    value={selected.time}
                    onChange={handleChange('time')}
                    options={times}
                />

                <button
                    type="submit"
                    disabled={!selected.time || loading}
                    className="w-full bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-semibold py-2 px-4 rounded-lg transition shadow disabled:opacity-40"
                >
                    {loading ? 'Запись...' : 'Записаться'}
                </button>
            </form>

            {showConfirm && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-6 max-w-md w-full text-sm">
                        <h3 className="text-lg font-bold text-purple-300 mb-4">Подтверждение записи</h3>
                        <ul className="mb-4 text-gray-400 space-y-1">
                            <li>🏙 Город: <b>{selected.city}</b></li>
                            <li>🏥 Клиника: <b>{selected.clinic}</b></li>
                            <li>👨‍⚕️ Врач: <b>{selected.doctor}</b></li>
                            <li>📆 Дата: <b>{selected.date}</b></li>
                            <li>🕒 Время: <b>{selected.time}</b></li>
                        </ul>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowConfirm(false)}
                                className="text-sm text-gray-400 hover:text-red-400 transition"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={confirmBooking}
                                className="bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-semibold py-1 px-4 rounded text-sm"
                            >
                                Подтвердить
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Select({ label, placeholder, value, onChange, options }) {
    return (
        <div className="space-y-1">
            <label className="text-sm text-gray-400">{label}</label>
            <select
                value={value}
                onChange={onChange}
                required
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
                <option value="" disabled>
                    {placeholder}
                </option>
                {options.map((opt) => (
                    <option key={opt.id || opt} value={opt.id || opt}>
                        {opt.name || opt}
                    </option>
                ))}
            </select>
        </div>
    );
}
