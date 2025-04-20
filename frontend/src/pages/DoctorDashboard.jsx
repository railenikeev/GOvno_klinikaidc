import React, { useEffect, useState } from 'react';
import {
    getMyAppointments,
    updateAppointment,
} from '../services/appointmentService';

export default function DoctorDashboard() {
    const [appointments, setAppointments] = useState([]);
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [selectedDate, setSelectedDate] = useState('');

    useEffect(() => {
        getMyAppointments()
            .then(setAppointments)
            .catch(() => alert('Ошибка загрузки приёмов'));
    }, []);

    const handleUpdate = async (id, data) => {
        try {
            await updateAppointment(id, data);
            setAppointments((prev) =>
                prev.map((a) => (a.id === id ? { ...a, ...data } : a))
            );
        } catch (err) {
            alert('Ошибка при обновлении приёма');
        }
    };

    const filteredAppointments = appointments
        .filter((a) => {
            const matchStatus =
                selectedStatus === 'all' || a.status === selectedStatus;

            const matchDate =
                !selectedDate ||
                new Date(`${a.date}T00:00`) >= new Date(`${selectedDate}T00:00`);

            return matchStatus && matchDate;
        })
        .sort((a, b) => {
            const aTime = new Date(`${a.date}T${a.time}`);
            const bTime = new Date(`${b.date}T${b.time}`);
            return aTime - bTime;
        });

    return (
        <div className="min-h-[calc(100vh-128px)] bg-gray-950 text-gray-200 font-mono px-4 py-12 flex justify-center">
            <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-xl p-8 max-w-4xl w-full">
                <h2 className="text-2xl font-bold text-purple-400 mb-6">
                    Приёмы пациентов
                </h2>

                {/* Фильтры */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Статус</label>
                        <select
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                            className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm text-gray-100 focus:outline-none"
                        >
                            <option value="all">Все</option>
                            <option value="Запланирован">Запланирован</option>
                            <option value="Завершён">Завершён</option>
                            <option value="Неявка">Неявка</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">С даты</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm text-gray-100 focus:outline-none"
                        />
                    </div>
                </div>

                {filteredAppointments.length === 0 ? (
                    <p className="text-sm text-gray-500">
                        Нет записей по выбранным фильтрам.
                    </p>
                ) : (
                    <div className="space-y-6">
                        {filteredAppointments.map((a) => (
                            <div
                                key={a.id}
                                className="bg-gray-800 border border-gray-700 rounded-lg p-4"
                            >
                                <div className="text-sm text-gray-300 space-y-1 mb-4">
                                    <p>
                                        <span className="text-gray-400">Дата:</span> {a.date}{' '}
                                        {a.time}
                                    </p>
                                    <p>
                                        <span className="text-gray-400">Пациент:</span>{' '}
                                        {a.patient || '—'}
                                    </p>
                                    <p>
                                        <span className="text-gray-400">Клиника:</span> {a.clinic}
                                    </p>
                                </div>

                                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                                    <select
                                        value={a.status}
                                        onChange={(e) =>
                                            handleUpdate(a.id, { status: e.target.value })
                                        }
                                        className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm text-gray-100 focus:outline-none"
                                    >
                                        <option value="Запланирован">Запланирован</option>
                                        <option value="Завершён">Завершён</option>
                                        <option value="Неявка">Неявка</option>
                                    </select>

                                    <input
                                        type="text"
                                        placeholder="Комментарий / диагноз"
                                        value={a.comment || ''}
                                        onChange={(e) =>
                                            setAppointments((prev) =>
                                                prev.map((item) =>
                                                    item.id === a.id
                                                        ? { ...item, comment: e.target.value }
                                                        : item
                                                )
                                            )
                                        }
                                        onBlur={() =>
                                            handleUpdate(a.id, { comment: a.comment || '' })
                                        }
                                        className="flex-1 bg-gray-800 border border-gray-700 px-3 py-1 text-sm text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
