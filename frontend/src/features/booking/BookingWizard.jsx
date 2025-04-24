import React, { useEffect, useState } from 'react'
// ⚠️ путь вверх на два уровня, потому что файл лежит в src/features/booking/
import {
    getClinics,
    getDoctors,
    getSchedule,
    createAppointment,
} from '../../services/bookingService'

export default function BookingWizard() {
    /* ──────────────── state ──────────────── */
    const [step, setStep] = useState(0)
    const [loading, setLoading] = useState(false)

    // выборы пользователя
    const [clinics, setClinics] = useState([])
    const [clinicId, setClinicId] = useState(null)

    const [doctors, setDoctors] = useState([])
    const [doctorId, setDoctorId] = useState(null)

    const [schedule, setSchedule] = useState([])
    const [slotId, setSlotId] = useState(null)

    /* ──────────────── first load ──────────────── */
    useEffect(() => {
        ;(async () => {
            const data = await getClinics().catch(() => [])
            setClinics(data)
        })()
    }, [])

    /* ──────────────── handlers ──────────────── */
    async function handleSelectClinic(id) {
        setClinicId(id)
        setLoading(true)
        try {
            const list = await getDoctors(id)
            setDoctors(list)
            setStep(1)
        } finally {
            setLoading(false)
        }
    }

    async function handleSelectDoctor(id) {
        setDoctorId(id)
        setLoading(true)
        try {
            const slots = await getSchedule(id)
            setSchedule(slots)
            setStep(2)
        } finally {
            setLoading(false)
        }
    }

    async function handleConfirm() {
        if (!slotId) return
        setLoading(true)
        try {
            await createAppointment({ slotId })
            setStep(3)
        } finally {
            setLoading(false)
        }
    }

    function reset() {
        setStep(0)
        setClinicId(null)
        setDoctorId(null)
        setSlotId(null)
    }

    /* ──────────────── ui helpers ──────────────── */
    const steps = ['Клиника', 'Врач', 'Время', 'Готово']

    function Stepper() {
        return (
            <div className="flex items-center mb-6 select-none">
                {steps.map((label, i) => (
                    <React.Fragment key={label}>
                        <div
                            className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium
                ${i <= step ? 'bg-purple-600' : 'bg-gray-700'}`}
                        >
                            {i + 1}
                        </div>
                        {i < steps.length - 1 && <div className="flex-1 h-px bg-gray-700 mx-1 sm:mx-2" />}
                    </React.Fragment>
                ))}
            </div>
        )
    }

    /* ──────────────── render ──────────────── */
    return (
        <div className="max-w-3xl mx-auto p-4 text-gray-100">
            <Stepper />

            {/* step 0 — клиники */}
            {step === 0 && (
                <div className="grid sm:grid-cols-2 gap-4">
                    {clinics.map(cl => (
                        <button
                            key={cl.id}
                            onClick={() => handleSelectClinic(cl.id)}
                            className="border border-gray-700 rounded-lg p-4 hover:bg-gray-800 text-left transition"
                        >
                            <p className="font-medium mb-1">{cl.name}</p>
                            <p className="text-sm text-gray-400">{cl.city}</p>
                        </button>
                    ))}
                </div>
            )}

            {/* step 1 — врачи */}
            {step === 1 && (
                <div className="grid sm:grid-cols-2 gap-4">
                    {doctors.map(doc => (
                        <button
                            key={doc.id}
                            onClick={() => handleSelectDoctor(doc.id)}
                            className="border border-gray-700 rounded-lg p-4 hover:bg-gray-800 text-left transition"
                        >
                            <p className="font-medium mb-1">{doc.full_name}</p>
                            <p className="text-sm text-gray-400">{doc.specialization}</p>
                        </button>
                    ))}
                </div>
            )}

            {/* step 2 — слоты */}
            {step === 2 && (
                <div>
                    <div className="grid sm:grid-cols-3 gap-3 mb-6">
                        {schedule.map(slot => (
                            <button
                                key={slot.id}
                                onClick={() => setSlotId(slot.id)}
                                className={`border rounded-lg p-2 text-sm transition
                  ${slotId === slot.id ? 'bg-purple-600' : 'bg-gray-800 hover:bg-gray-700'}`}
                            >
                                {slot.date} {slot.time}
                            </button>
                        ))}
                    </div>
                    <button
                        disabled={!slotId || loading}
                        onClick={handleConfirm}
                        className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg px-4 py-2"
                    >
                        Записаться
                    </button>
                </div>
            )}

            {/* step 3 — готово */}
            {step === 3 && (
                <div className="text-center space-y-4">
                    <p className="text-xl font-semibold">Запись успешно создана!</p>
                    <button onClick={reset} className="bg-purple-600 hover:bg-purple-500 rounded-lg px-4 py-2">
                        Новая запись
                    </button>
                </div>
            )}

            {/* глобальный оверлей загрузки */}
            {loading && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center text-lg">
                    Загрузка…
                </div>
            )}
        </div>
    )
}
