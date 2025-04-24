// frontend/src/pages/DoctorDashboard.jsx
import React, { useEffect, useState } from 'react';
import {
    getMyAppointments,
    updateAppointmentStatus,
    getMySlots,
    createSlot,
    deleteSlot,
} from '../services/appointmentService';

export default function DoctorDashboard() {
    const [tab, setTab] = useState('appointments'); // 'appointments' | 'slots'

    const [appointments, setAppointments] = useState([]);
    const [slots, setSlots]               = useState([]);

    // Новые поля для создания слота
    const [newDate, setNewDate]     = useState('');
    const [newStart, setNewStart]   = useState('');
    const [newEnd, setNewEnd]       = useState('');

    // Загрузка записей
    useEffect(() => {
        if (tab !== 'appointments') return;
        getMyAppointments()
            .then(setAppointments)
            .catch(err => {
                console.error(err);
                alert(err.message);
                setAppointments([]); // чтобы не было undefined
            });
    }, [tab]);

    // Загрузка слотов
    useEffect(() => {
        if (tab !== 'slots') return;
        getMySlots()
            .then(setSlots)
            .catch(err => {
                console.error(err);
                alert(err.message);
                setSlots([]); // защита от null
            });
    }, [tab]);

    // Подтвердить / отменить запись
    const handleUpdateAppointment = async (id, status) => {
        try {
            await updateAppointmentStatus(id, status);
            setAppointments(prev =>
                prev.map(a => (a.id === id ? { ...a, status } : a))
            );
        } catch (err) {
            console.error(err);
            alert(err.message);
        }
    };

    // Добавить слот
    const handleAddSlot = async () => {
        if (!newDate || !newStart || !newEnd) {
            return alert('Укажите все поля для нового слота');
        }
        try {
            const slot = await createSlot({
                date: newDate,
                start_time: newStart,
                end_time: newEnd,
            });
            setSlots(prev => [...prev, slot]);
            setNewDate('');
            setNewStart('');
            setNewEnd('');
        } catch (err) {
            console.error(err);
            alert(err.message);
        }
    };

    // Удалить слот
    const handleDeleteSlot = async id => {
        if (!window.confirm('Удалить этот слот?')) return;
        try {
            await deleteSlot(id);
            setSlots(prev => prev.filter(s => s.id !== id));
        } catch (err) {
            console.error(err);
            alert(err.message);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
            <h1 className="text-3xl font-bold mb-6">Панель врача</h1>

            <div className="flex space-x-4 mb-8">
                <button
                    onClick={() => setTab('appointments')}
                    className={
                        tab === 'appointments'
                            ? 'px-4 py-2 bg-purple-600 rounded'
                            : 'px-4 py-2 bg-gray-700 rounded hover:bg-gray-600'
                    }
                >
                    Записи
                </button>
                <button
                    onClick={() => setTab('slots')}
                    className={
                        tab === 'slots'
                            ? 'px-4 py-2 bg-purple-600 rounded'
                            : 'px-4 py-2 bg-gray-700 rounded hover:bg-gray-600'
                    }
                >
                    Слоты
                </button>
            </div>

            {tab === 'appointments' && (
                <>
                    {appointments.length === 0 ? (
                        <p>Нет записей.</p>
                    ) : (
                        <div className="space-y-4">
                            {appointments.map(a => (
                                <div
                                    key={a.id}
                                    className="bg-gray-800 p-4 rounded flex justify-between items-center"
                                >
                                    <div>
                                        <div className="font-medium">{a.patient_name}</div>
                                        <div className="text-sm text-gray-400">
                                            {a.date} в {a.time}
                                        </div>
                                        <div className="text-sm">Статус: {a.status}</div>
                                    </div>
                                    <div className="space-x-2">
                                        {a.status !== 'confirmed' && (
                                            <button
                                                onClick={() =>
                                                    handleUpdateAppointment(a.id, 'confirmed')
                                                }
                                                className="px-3 py-1 bg-green-600 rounded hover:bg-green-500"
                                            >
                                                Подтвердить
                                            </button>
                                        )}
                                        {a.status !== 'canceled' && (
                                            <button
                                                onClick={() =>
                                                    handleUpdateAppointment(a.id, 'canceled')
                                                }
                                                className="px-3 py-1 bg-red-600 rounded hover:bg-red-500"
                                            >
                                                Отменить
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {tab === 'slots' && (
                <>
                    <h2 className="text-2xl font-semibold mb-4">Управление слотами</h2>
                    <div className="flex flex-wrap gap-4 mb-6">
                        <input
                            type="date"
                            value={newDate}
                            onChange={e => setNewDate(e.target.value)}
                            className="bg-gray-700 px-3 py-1 rounded"
                        />
                        <input
                            type="time"
                            value={newStart}
                            onChange={e => setNewStart(e.target.value)}
                            className="bg-gray-700 px-3 py-1 rounded"
                        />
                        <input
                            type="time"
                            value={newEnd}
                            onChange={e => setNewEnd(e.target.value)}
                            className="bg-gray-700 px-3 py-1 rounded"
                        />
                        <button
                            onClick={handleAddSlot}
                            className="px-4 py-1 bg-purple-600 rounded hover:bg-purple-500"
                        >
                            Добавить слот
                        </button>
                    </div>
                    {slots && slots.length === 0 ? (
                        <p>Нет доступных слотов.</p>
                    ) : (
                        <div className="space-y-2">
                            {slots &&
                                slots.map(s => (
                                    <div
                                        key={s.id}
                                        className="bg-gray-800 p-3 rounded flex justify-between items-center"
                                    >
                                        <div className="text-sm">
                      <span className="font-medium">
                        {s.start_time.slice(0, 10)}
                      </span>{' '}
                                            <span>
                        {s.start_time.slice(11, 16)} — {s.end_time.slice(11, 16)}
                      </span>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteSlot(s.id)}
                                            className="text-red-500 hover:text-red-400"
                                        >
                                            Удалить
                                        </button>
                                    </div>
                                ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
