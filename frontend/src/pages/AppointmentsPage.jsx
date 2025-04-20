// src/features/appointments/AppointmentsPage.jsx
import React, { useState } from 'react';

export default function AppointmentsPage() {
    // Моковые данные приёмов
    const [appointments] = useState([
        { id: 1, date: '2025-05-04', time: '16:45', clinic: 'Поликлиника №1', doctor: 'Иванов И.И.', status: 'Отменено' },
        { id: 2, date: '2025-05-03', time: '11:15', clinic: 'Центр здоровья', doctor: 'Сидорова С.С.', status: 'Запланировано' },
        { id: 3, date: '2025-05-02', time: '14:00', clinic: 'Стоматология «Улыбка»', doctor: 'Петров П.П.', status: 'Завершено' },
        { id: 4, date: '2025-05-01', time: '09:30', clinic: 'Поликлиника №1', doctor: 'Иванов И.И.', status: 'Запланировано' },
    ]);

    const [dateFilter, setDateFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('Все');
    const [sortDesc, setSortDesc] = useState(true);

    // Фильтрация и сортировка
    const filtered = appointments
        .filter(a =>
            (!dateFilter || a.date === dateFilter) &&
            (statusFilter === 'Все' || a.status === statusFilter)
        )
        .sort((a, b) =>
            sortDesc
                ? b.date.localeCompare(a.date)
                : a.date.localeCompare(b.date)
        );

    return (
        <div className="flex flex-col flex-grow bg-gray-950 py-8">
            <div className="container mx-auto px-4">
                <h1 className="text-2xl font-mono text-purple-400 mb-6">
                    Мои записи
                </h1>

                <div className="flex flex-wrap items-center gap-4 mb-6">
                    <input
                        type="date"
                        value={dateFilter}
                        onChange={e => setDateFilter(e.target.value)}
                        className="bg-gray-900 text-gray-300 px-3 py-2 rounded-lg"
                        placeholder="дд.мм.гггг"
                    />

                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="bg-gray-900 text-gray-300 px-3 py-2 rounded-lg"
                    >
                        <option>Все</option>
                        <option>Запланировано</option>
                        <option>Завершено</option>
                        <option>Отменено</option>
                    </select>

                    <button
                        onClick={() => setSortDesc(!sortDesc)}
                        className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg"
                    >
                        {sortDesc ? 'Сортировать по возрастанию' : 'Сортировать по убыванию'}
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full bg-gray-900 text-gray-300 rounded-lg overflow-hidden">
                        <thead>
                        <tr className="text-left text-gray-400">
                            <th className="px-4 py-2">Дата</th>
                            <th className="px-4 py-2">Время</th>
                            <th className="px-4 py-2">Клиника</th>
                            <th className="px-4 py-2">Врач</th>
                            <th className="px-4 py-2">Статус</th>
                            <th className="px-4 py-2">Действия</th>
                        </tr>
                        </thead>
                        <tbody>
                        {filtered.map(item => (
                            <tr key={item.id} className="border-t border-gray-800">
                                <td className="px-4 py-3">{item.date}</td>
                                <td className="px-4 py-3">{item.time}</td>
                                <td className="px-4 py-3">{item.clinic}</td>
                                <td className="px-4 py-3">{item.doctor}</td>
                                <td className="px-4 py-3">{item.status}</td>
                                <td className="px-4 py-3">
                                    {item.status === 'Запланировано' ? (
                                        <button className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded">
                                            Отменить
                                        </button>
                                    ) : (
                                        '—'
                                    )}
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
