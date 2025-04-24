// frontend/src/features/booking/BookingWizard.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
    fetchClinics,
    fetchDoctors,
    fetchAvailableTimes,
    createAppointment,
} from '../../services/bookingService';

const steps = ['Город', 'Клиника', 'Врач', 'Время'];

export default function BookingWizard() {
    const [step, setStep] = useState(0);

    // ───── исходные данные ─────
    const [clinics, setClinics]    = useState([]);
    const [clinicId, setClinicId]  = useState(null);

    const [doctors, setDoctors]    = useState([]);
    const [doctorId, setDoctorId]  = useState(null);

    const [date, setDate]          = useState('');
    const [slots, setSlots]        = useState([]);
    const [time, setTime]          = useState('');

    /** загрузка всех клиник один раз */
    useEffect(() => {
        fetchClinics()
            .then(setClinics)
            .catch(() => alert('Не удалось загрузить клиники'));
    }, []);

    /** уникальные города из полученных клиник */
    const cities = useMemo(() => {
        const set = new Set(clinics.map(c => c.city));
        return Array.from(set).sort();
    }, [clinics]);

    /** клиники выбранного города */
    const [city, setCity] = useState('');
    const cityClinics     = clinics.filter(c => c.city === city);

    /** врачи по выбранной клинике */
    useEffect(() => {
        if (!clinicId) return;
        fetchDoctors(clinicId)
            .then(setDoctors)
            .catch(() => alert('Не удалось загрузить врачей'));
    }, [clinicId]);

    /** слоты по врачу + дате */
    useEffect(() => {
        if (!doctorId || !date) return;
        fetchAvailableTimes(doctorId, date)
            .then(setSlots)
            .catch(() => alert('Не удалось загрузить свободное время'));
    }, [doctorId, date]);

    /* ─────────── UI ─────────── */

    return (
        <div className="mx-auto max-w-4xl py-8 px-4">
            {/* Stepper */}
            <div className="flex items-center justify-between mb-10">
                {steps.map((s, i) => (
                    <div key={s} className="flex-1 flex flex-col items-center">
                        <div
                            className={`w-8 h-8 flex items-center justify-center rounded-full
                ${step === i ? 'bg-purple-600 text-white'
                                : 'bg-gray-700 text-gray-300'}`}
                        >
                            {i + 1}
                        </div>
                        <span className="mt-2 text-sm text-gray-400">{s}</span>
                        {i < steps.length - 1 && (
                            <div className="h-px bg-gray-700 flex-1 w-full" />
                        )}
                    </div>
                ))}
            </div>

            {/* Шаг 0 — города */}
            {step === 0 && (
                <div className="grid gap-4 sm:grid-cols-3">
                    {cities.map(ct => (
                        <button
                            key={ct}
                            onClick={() => {
                                setCity(ct);
                                setStep(1);
                            }}
                            className="bg-gray-800 hover:bg-gray-700 rounded-lg p-4 text-white"
                        >
                            {ct}
                        </button>
                    ))}
                </div>
            )}

            {/* Шаг 1 — клиники */}
            {step === 1 && (
                <>
                    <p className="mb-4 text-gray-300">{city}</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {cityClinics.map(cl => (
                            <button
                                key={cl.id}
                                onClick={() => {
                                    setClinicId(cl.id);
                                    setStep(2);
                                }}
                                className="bg-gray-800 hover:bg-gray-700 rounded-lg p-4 text-left"
                            >
                                <h3 className="text-lg text-white font-semibold">{cl.name}</h3>
                                <p className="text-sm text-gray-400">{cl.address}</p>
                            </button>
                        ))}
                    </div>
                </>
            )}

            {/* Шаг 2 — врачи */}
            {step === 2 && (
                <>
                    <p className="mb-4 text-gray-300">
                        {cityClinics.find(c => c.id === clinicId)?.name}
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {doctors.map(d => (
                            <button
                                key={d.id}
                                onClick={() => {
                                    setDoctorId(d.id);
                                    setStep(3);
                                }}
                                className="bg-gray-800 hover:bg-gray-700 rounded-lg p-4 text-left"
                            >
                                <h3 className="text-white">{d.full_name}</h3>
                                <p className="text-sm text-gray-400">{d.specialization}</p>
                            </button>
                        ))}
                    </div>
                </>
            )}

            {/* Шаг 3 — дата / время */}
            {step === 3 && (
                <>
                    <p className="mb-6 text-gray-300">
                        {cityClinics.find(c => c.id === clinicId)?.name} →{' '}
                        {doctors.find(d => d.id === doctorId)?.full_name}
                    </p>

                    <input
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2
                       text-gray-100 focus:ring-2 focus:ring-purple-600 mb-6"
                    />

                    {date && (
                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                            {slots.length === 0 && (
                                <p className="text-gray-400 col-span-full">Нет свободных слотов</p>
                            )}
                            {slots.map(t => (
                                <button
                                    key={t}
                                    onClick={() => setTime(t)}
                                    className={`rounded-lg px-3 py-2 ${
                                        t === time
                                            ? 'bg-purple-600 text-white'
                                            : 'bg-gray-800 hover:bg-gray-700 text-gray-100'
                                    }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    )}

                    {time && (
                        <button
                            onClick={async () => {
                                try {
                                    await createAppointment({ doctor_id: doctorId, date, time });
                                    alert('Запись создана!');
                                    // сброс до первого шага
                                    setStep(0);
                                    setCity('');
                                    setClinicId(null);
                                    setDoctorId(null);
                                    setDate('');
                                    setTime('');
                                } catch (err) {
                                    alert(err.message);
                                }
                            }}
                            className="mt-8 bg-purple-600 hover:bg-purple-500
                         rounded-lg px-6 py-3 text-white font-medium"
                        >
                            Подтвердить
                        </button>
                    )}
                </>
            )}
        </div>
    );
}
