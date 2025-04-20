// src/features/booking/BookingWizard.jsx
import React, { useState, useEffect } from 'react'
import {
    fetchClinics,
    fetchDoctors,
    fetchAvailableTimes,
    createAppointment,
} from '../../services/bookingService'

const steps = [
    { key: 'clinic', title: 'Клиника' },
    { key: 'doctor', title: 'Врач' },
    { key: 'time', title: 'Дата & время' },
    { key: 'confirm', title: 'Подтвердить' },
]

export default function BookingWizard() {
    const [current, setCurrent] = useState(0)

    const [clinics, setClinics] = useState([])
    const [doctors, setDoctors] = useState([])
    const [times, setTimes] = useState([])

    const [selection, setSelection] = useState({
        clinic: null,
        doctor: null,
        date: '',
        time: '',
    })

    // Подгружаем данные на каждом шаге
    useEffect(() => {
        if (current === 0) {
            fetchClinics().then(setClinics).catch(console.error)
        }
        if (current === 1 && selection.clinic) {
            fetchDoctors(selection.clinic).then(setDoctors).catch(console.error)
        }
        if (current === 2 && selection.doctor && selection.date) {
            fetchAvailableTimes(selection.doctor, selection.date)
                .then(setTimes)
                .catch(console.error)
        }
    }, [current, selection.clinic, selection.doctor, selection.date])

    const next = () => setCurrent((c) => Math.min(c + 1, steps.length - 1))
    const prev = () => setCurrent((c) => Math.max(c - 1, 0))

    const onSubmit = async () => {
        try {
            await createAppointment({
                doctor_id: selection.doctor,
                date: selection.date,
                time: selection.time,
            })
            alert('Вы успешно записаны!')
            // здесь можно делать редирект или сбросить формы
        } catch (e) {
            alert(`Ошибка при записи: ${e.message}`)
        }
    }

    return (
        <div className="max-w-md mx-auto p-6 bg-gray-900 rounded-xl shadow-lg">
            {/* Степпер */}
            <div className="flex justify-between mb-8">
                {steps.map((s, i) => (
                    <div key={s.key} className="flex-1 relative text-center">
                        <div
                            className={`mx-auto w-8 h-8 leading-8 rounded-full text-white 
                ${i === current ? 'bg-purple-600' : 'bg-gray-700'}`}
                        >
                            {i + 1}
                        </div>
                        <div className="mt-2 text-sm text-gray-300">{s.title}</div>
                        {i < steps.length - 1 && (
                            <div className="absolute top-4 left-1/2 w-full h-px bg-gray-700 -translate-x-1/2"></div>
                        )}
                    </div>
                ))}
            </div>

            {/* Контент шага */}
            <div className="min-h-[200px]">
                {current === 0 && (
                    <ul className="space-y-4">
                        {clinics.map((c) => (
                            <li key={c.id}>
                                <button
                                    onClick={() => {
                                        setSelection((s) => ({ ...s, clinic: c.id }))
                                        next()
                                    }}
                                    className="w-full p-4 bg-gray-800 hover:bg-gray-700 rounded-lg text-left"
                                >
                                    <div className="font-medium text-white">{c.name}</div>
                                    <div className="text-gray-400 text-sm">{c.city}</div>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {current === 1 && (
                    <ul className="space-y-4">
                        {doctors.map((d) => (
                            <li key={d.id}>
                                <button
                                    onClick={() => {
                                        setSelection((s) => ({ ...s, doctor: d.id }))
                                        next()
                                    }}
                                    className="w-full p-4 bg-gray-800 hover:bg-gray-700 rounded-lg text-left"
                                >
                                    <div className="font-medium text-white">{d.full_name}</div>
                                    <div className="text-gray-400 text-sm">{d.specialization}</div>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {current === 2 && (
                    <>
                        <input
                            type="date"
                            className="w-full p-2 mb-4 bg-gray-800 rounded text-white"
                            value={selection.date}
                            onChange={(e) =>
                                setSelection((s) => ({ ...s, date: e.target.value }))
                            }
                        />
                        <ul className="grid grid-cols-2 gap-4">
                            {times.map((slot) => (
                                <li key={slot}>
                                    <button
                                        onClick={() => {
                                            setSelection((s) => ({ ...s, time: slot }))
                                            next()
                                        }}
                                        className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-lg"
                                    >
                                        {slot}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {current === 3 && (
                    <div className="space-y-4">
                        <p>
                            <span className="text-gray-400">Клиника:</span>{' '}
                            <span className="font-medium text-white">
                {clinics.find((c) => c.id === selection.clinic)?.name}
              </span>
                        </p>
                        <p>
                            <span className="text-gray-400">Врач:</span>{' '}
                            <span className="font-medium text-white">
                {doctors.find((d) => d.id === selection.doctor)
                    ?.full_name}
              </span>
                        </p>
                        <p>
                            <span className="text-gray-400">Дата:</span>{' '}
                            <span className="font-medium text-white">
                {selection.date}
              </span>
                        </p>
                        <p>
                            <span className="text-gray-400">Время:</span>{' '}
                            <span className="font-medium text-white">
                {selection.time}
              </span>
                        </p>
                        <button
                            onClick={onSubmit}
                            className="mt-4 w-full py-3 bg-purple-600 hover:bg-purple-500 rounded-lg text-white"
                        >
                            Записаться
                        </button>
                    </div>
                )}
            </div>

            {/* Навигация */}
            <div className="flex justify-between mt-6">
                <button
                    onClick={prev}
                    disabled={current === 0}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50 text-white"
                >
                    Назад
                </button>
                {current < steps.length - 1 && (
                    <button
                        onClick={next}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-white"
                    >
                        Далее
                    </button>
                )}
            </div>
        </div>
    )
}
