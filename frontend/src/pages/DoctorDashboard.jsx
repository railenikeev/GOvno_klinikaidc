// frontend/src/pages/DoctorDashboard.jsx
import React, { useEffect, useState } from 'react'
import {
    getMyAppointments,
    updateAppointmentStatus,
    getMySlots,
    createSlot,
    updateSlot,
    deleteSlot,
} from '../services/appointmentService'

export default function DoctorDashboard() {
    const [tab, setTab] = useState('appointments') // 'appointments' | 'slots'

    // Appointments
    const [appointments, setAppointments] = useState([])

    // Slots
    const [slots, setSlots] = useState([])

    // New/editing slot fields
    const [editingSlot, setEditingSlot] = useState(null)
    const [slotDate, setSlotDate] = useState('')
    const [slotStart, setSlotStart] = useState('')
    const [slotEnd, setSlotEnd] = useState('')

    // Load appointments when tab is 'appointments'
    useEffect(() => {
        if (tab !== 'appointments') return
        getMyAppointments()
            .then(setAppointments)
            .catch(() => alert('Не удалось загрузить записи'))
    }, [tab])

    // Load slots when tab is 'slots'
    useEffect(() => {
        if (tab !== 'slots') return
        getMySlots()
            .then(setSlots)
            .catch(() => alert('Не удалось загрузить слоты'))
    }, [tab])

    // Handlers for appointments
    const onChangeAppointmentStatus = async (id, status) => {
        try {
            await updateAppointmentStatus(id, status)
            setAppointments((prev) =>
                prev.map((a) => (a.id === id ? { ...a, status } : a))
            )
        } catch {
            alert('Не удалось обновить статус')
        }
    }

    // Handlers for slots
    const resetSlotForm = () => {
        setEditingSlot(null)
        setSlotDate('')
        setSlotStart('')
        setSlotEnd('')
    }

    const onSaveSlot = async () => {
        if (!slotDate || !slotStart || !slotEnd) {
            return alert('Укажите дату, время начала и время конца')
        }
        try {
            let saved
            if (editingSlot) {
                saved = await updateSlot(editingSlot.id, {
                    date: slotDate,
                    start_time: slotStart,
                    end_time: slotEnd,
                })
                setSlots((prev) =>
                    prev.map((s) => (s.id === saved.id ? saved : s))
                )
            } else {
                saved = await createSlot({
                    date: slotDate,
                    start_time: slotStart,
                    end_time: slotEnd,
                })
                setSlots((prev) => [...prev, saved])
            }
            resetSlotForm()
        } catch (err) {
            alert(err.message)
        }
    }

    const onEditSlot = (slot) => {
        setEditingSlot(slot)
        setSlotDate(slot.date)
        setSlotStart(slot.start_time)
        setSlotEnd(slot.end_time)
    }

    const onDeleteSlot = async (id) => {
        if (!window.confirm('Удалить этот слот?')) return
        try {
            await deleteSlot(id)
            setSlots((prev) => prev.filter((s) => s.id !== id))
        } catch {
            alert('Не удалось удалить слот')
        }
    }

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
            <h1 className="text-3xl font-bold mb-6">Панель врача</h1>

            {/* Tabs */}
            <div className="flex space-x-4 mb-8">
                <button
                    onClick={() => setTab('appointments')}
                    className={`px-4 py-2 rounded ${
                        tab === 'appointments'
                            ? 'bg-purple-600'
                            : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                >
                    Записи
                </button>
                <button
                    onClick={() => setTab('slots')}
                    className={`px-4 py-2 rounded ${
                        tab === 'slots'
                            ? 'bg-purple-600'
                            : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                >
                    Слоты
                </button>
            </div>

            {tab === 'appointments' && (
                <div className="space-y-4">
                    {appointments.length === 0 ? (
                        <p>Нет записей.</p>
                    ) : (
                        appointments.map((a) => (
                            <div
                                key={a.id}
                                className="bg-gray-800 p-4 rounded-lg flex justify-between items-center"
                            >
                                <div>
                                    <div className="font-semibold">{a.patient_name}</div>
                                    <div className="text-sm text-gray-400">
                                        {a.date} в {a.time}
                                    </div>
                                    <div className="text-sm">
                                        Статус:{' '}
                                        <span
                                            className={
                                                a.status === 'confirmed'
                                                    ? 'text-green-400'
                                                    : a.status === 'canceled'
                                                        ? 'text-red-400'
                                                        : 'text-yellow-400'
                                            }
                                        >
                      {a.status}
                    </span>
                                    </div>
                                </div>
                                <div className="space-x-2">
                                    {a.status !== 'confirmed' && (
                                        <button
                                            onClick={() =>
                                                onChangeAppointmentStatus(a.id, 'confirmed')
                                            }
                                            className="px-3 py-1 bg-green-600 rounded hover:bg-green-500"
                                        >
                                            Подтвердить
                                        </button>
                                    )}
                                    {a.status !== 'canceled' && (
                                        <button
                                            onClick={() =>
                                                onChangeAppointmentStatus(a.id, 'canceled')
                                            }
                                            className="px-3 py-1 bg-red-600 rounded hover:bg-red-500"
                                        >
                                            Отменить
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {tab === 'slots' && (
                <div>
                    <h2 className="text-2xl font-semibold mb-4">Управление слотами</h2>

                    {/* Slot form */}
                    <div className="bg-gray-800 p-6 rounded-lg mb-6 grid gap-4 sm:grid-cols-4">
                        <input
                            type="date"
                            value={slotDate}
                            onChange={(e) => setSlotDate(e.target.value)}
                            className="bg-gray-700 px-3 py-2 rounded focus:outline-none"
                        />
                        <input
                            type="time"
                            value={slotStart}
                            onChange={(e) => setSlotStart(e.target.value)}
                            className="bg-gray-700 px-3 py-2 rounded focus:outline-none"
                        />
                        <input
                            type="time"
                            value={slotEnd}
                            onChange={(e) => setSlotEnd(e.target.value)}
                            className="bg-gray-700 px-3 py-2 rounded focus:outline-none"
                        />
                        <button
                            onClick={onSaveSlot}
                            className="bg-purple-600 hover:bg-purple-500 text-white font-medium rounded px-4 py-2"
                        >
                            {editingSlot ? 'Сохранить' : 'Добавить'} слот
                        </button>
                    </div>

                    {/* Slots list */}
                    {slots.length === 0 ? (
                        <p>Нет доступных слотов.</p>
                    ) : (
                        <div className="space-y-2">
                            {slots.map((s) => (
                                <div
                                    key={s.id}
                                    className="bg-gray-800 p-4 rounded-lg flex justify-between items-center"
                                >
                                    <div>
                                        <div className="font-medium">{s.date}</div>
                                        <div className="text-sm text-gray-400">
                                            {s.start_time} — {s.end_time}
                                        </div>
                                    </div>
                                    <div className="space-x-2">
                                        <button
                                            onClick={() => onEditSlot(s)}
                                            className="px-3 py-1 bg-blue-600 rounded hover:bg-blue-500"
                                        >
                                            Редактировать
                                        </button>
                                        <button
                                            onClick={() => onDeleteSlot(s.id)}
                                            className="px-3 py-1 bg-red-600 rounded hover:bg-red-500"
                                        >
                                            Удалить
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
