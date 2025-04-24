// frontend/src/features/booking/BookingWizard.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
    fetchClinics,
    fetchDoctors,
    fetchAvailableTimes,
    createAppointment,
} from '../../services/bookingService';

export default function BookingWizard() {
    const [clinics, setClinics] = useState([]);
    const [city, setCity] = useState('');
    const [clinicId, setClinicId] = useState('');
    const [doctors, setDoctors] = useState([]);
    const [doctorId, setDoctorId] = useState('');
    const today = new Date().toISOString().split('T')[0];
    const [date, setDate] = useState(today);
    const [slots, setSlots] = useState([]);
    const [time, setTime] = useState('');
    const [saving, setSaving] = useState(false);
    const [info, setInfo] = useState('');

    /* ───── загрузка клиник ───── */
    useEffect(() => {
        fetchClinics().then(setClinics).catch(() => alert('Не удалось загрузить клиники'));
    }, []);

    const cities = useMemo(() => Array.from(new Set(clinics.map(c => c.city))).sort(), [clinics]);
    const cityClinics = clinics.filter(c => c.city === city);

    /* ───── врачи ───── */
    useEffect(() => {
        if (!clinicId) return;
        setDoctorId('');
        setDate(today);
        setSlots([]);
        setTime('');
        fetchDoctors(clinicId).then(setDoctors).catch(() => alert('Не удалось загрузить врачей'));
    }, [clinicId]);

    /* ───── свободные слоты ───── */
    useEffect(() => {
        if (!doctorId || !date) return;
        setTime('');
        fetchAvailableTimes(doctorId, date)
            .then(setSlots)
            .catch(() => alert('Не удалось загрузить время'));
    }, [doctorId, date]);

    /* ───── отправка ───── */
    async function handleSubmit(e) {
        e.preventDefault();
        if (!doctorId || !date || !time) return;
        setSaving(true);
        try {
            await createAppointment({ doctor_id: doctorId, date, time });
            setInfo('✅ Запись создана!');
            setClinicId('');
            setDoctorId('');
            setSlots([]);
            setTime('');
        } catch (err) {
            alert(err.message);
        } finally {
            setSaving(false);
        }
    }

    /* ───── общий класс для select / input ───── */
    const ctrl =
        'w-full bg-gray-800 text-gray-100 border border-gray-600 rounded px-3 py-2 ' +
        'focus:outline-none focus:ring-2 focus:ring-purple-600';

    return (
        <div className="max-w-3xl mx-auto p-6">
            <h1 className="text-2xl font-semibold mb-6 text-center text-gray-100">Он-лайн запись</h1>

            {info && (
                <p className="mb-6 bg-green-900/40 border border-green-600 text-green-200 px-4 py-3 rounded">
                    {info}
                </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-6 text-gray-100">
                {/* город */}
                <div>
                    <label className="block mb-1">Город</label>
                    <select
                        className={ctrl}
                        value={city}
                        onChange={e => setCity(e.target.value)}
                        required
                    >
                        <option value="" disabled className="text-gray-400">
                            — выберите город —
                        </option>
                        {cities.map(c => (
                            <option key={c}>{c}</option>
                        ))}
                    </select>
                </div>

                {/* клиника */}
                <div>
                    <label className="block mb-1">Клиника</label>
                    <select
                        className={ctrl}
                        value={clinicId}
                        onChange={e => setClinicId(e.target.value)}
                        disabled={!city}
                        required
                    >
                        <option value="" disabled className="text-gray-400">
                            — выберите клинику —
                        </option>
                        {cityClinics.map(cl => (
                            <option key={cl.id} value={cl.id}>
                                {cl.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* врач */}
                <div>
                    <label className="block mb-1">Врач</label>
                    <select
                        className={ctrl}
                        value={doctorId}
                        onChange={e => setDoctorId(e.target.value)}
                        disabled={!clinicId}
                        required
                    >
                        <option value="" disabled className="text-gray-400">
                            — выберите врача —
                        </option>
                        {doctors.map(d => (
                            <option key={d.id} value={d.id}>
                                {d.full_name} • {d.specialization || '—'}
                            </option>
                        ))}
                    </select>
                </div>

                {/* дата + время */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex-1">
                        <label className="block mb-1">Дата</label>
                        <input
                            type="date"
                            className={ctrl}
                            value={date}
                            min={today}
                            onChange={e => setDate(e.target.value)}
                            disabled={!doctorId}
                            required
                        />
                    </div>

                    {slots.length > 0 && (
                        <div className="flex-1 mt-4 sm:mt-0">
                            <label className="block mb-1">Время</label>
                            <select
                                className={ctrl}
                                value={time}
                                onChange={e => setTime(e.target.value)}
                                required
                            >
                                <option value="" disabled className="text-gray-400">
                                    — выберите время —
                                </option>
                                {slots.map(t => (
                                    <option key={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* кнопка */}
                <button
                    type="submit"
                    disabled={saving || !time}
                    className="w-full bg-purple-700 hover:bg-purple-600 disabled:opacity-50
                     text-white font-medium py-2 rounded transition"
                >
                    {saving ? 'Сохраняем…' : 'Записаться'}
                </button>
            </form>
        </div>
    );
}
