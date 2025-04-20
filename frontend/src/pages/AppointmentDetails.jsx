import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function AppointmentDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [appointment, setAppointment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');

        fetch(`http://localhost:8000/api/appointments/${id}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        })
            .then((res) => {
                if (!res.ok) throw new Error('Ошибка загрузки');
                return res.json();
            })
            .then(setAppointment)
            .catch(() => alert('Не удалось загрузить приём'))
            .finally(() => setLoading(false));
    }, [id]);

    const handleSave = async () => {
        setSaving(true);
        const token = localStorage.getItem('token');

        const res = await fetch(`http://localhost:8000/api/appointments/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                comment: appointment.comment,
                status: appointment.status,
            }),
        });

        setSaving(false);

        if (!res.ok) {
            alert('Ошибка при сохранении');
        } else {
            alert('Данные сохранены');
            navigate('/doctor'); // или куда тебе нужно
        }
    };

    if (loading || !appointment) {
        return (
            <div className="min-h-screen bg-gray-950 text-gray-300 font-mono flex items-center justify-center">
                Загрузка...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 text-gray-300 font-mono px-4 py-12 flex justify-center">
            <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-xl p-8 max-w-2xl w-full space-y-6">
                <h2 className="text-2xl font-bold text-purple-400">Приём #{appointment.id}</h2>

                <div className="space-y-1 text-sm text-gray-300">
                    <p><span className="text-gray-500">Пациент:</span> {appointment.patient || '—'}</p>
                    <p><span className="text-gray-500">Дата:</span> {appointment.date} {appointment.time}</p>
                    <p><span className="text-gray-500">Клиника:</span> {appointment.clinic}</p>
                </div>

                <div className="flex flex-col gap-3">
                    <label className="text-sm text-gray-400">Статус приёма</label>
                    <select
                        value={appointment.status}
                        onChange={(e) => setAppointment({ ...appointment, status: e.target.value })}
                        className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none"
                    >
                        <option value="Запланирован">Запланирован</option>
                        <option value="Завершён">Завершён</option>
                        <option value="Неявка">Неявка</option>
                    </select>

                    <label className="text-sm text-gray-400">Комментарий / диагноз</label>
                    <textarea
                        rows={5}
                        value={appointment.comment || ''}
                        onChange={(e) => setAppointment({ ...appointment, comment: e.target.value })}
                        className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                        placeholder="Введите заключение врача..."
                    />
                </div>

                <div className="flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-semibold py-2 px-6 rounded transition shadow disabled:opacity-50"
                    >
                        {saving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                </div>
            </div>
        </div>
    );
}
