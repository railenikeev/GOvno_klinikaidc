import React, { useEffect, useState } from 'react';
import {
    getClinics,
    getUsers,
    createClinic,
    assignClinicAdmin,
} from '../services/clinicService';

export default function SystemAdminDashboard() {
    const [clinics, setClinics]           = useState([]);
    const [users, setUsers]               = useState([]);
    const [form, setForm]                 = useState({
        city: '',
        name: '',
        address: '',
        phone: '',
        adminId: '',
    });
    const [assignMap, setAssignMap]       = useState({});

    useEffect(() => {
        loadClinics();
        loadUsers();
    }, []);

    async function loadClinics() {
        try {
            setClinics(await getClinics());
        } catch {
            alert('Ошибка загрузки клиник');
        }
    }

    async function loadUsers() {
        try {
            setUsers(await getUsers());
        } catch {
            alert('Ошибка загрузки пользователей');
        }
    }

    async function handleCreateClinic(e) {
        e.preventDefault();
        try {
            await createClinic(form);
            setForm({ city: '', name: '', address: '', phone: '', adminId: '' });
            loadClinics();
        } catch (err) {
            alert(err.message);
        }
    }

    async function handleAssignAdmin(clinicId) {
        const userId = assignMap[clinicId];
        if (!userId) return;
        try {
            await assignClinicAdmin(clinicId, userId);
            alert('Администратор клиники назначен');
            loadClinics();
        } catch (err) {
            alert(err.message);
        }
    }

    return (
        <div className="min-h-[calc(100vh-128px)] bg-gray-950 text-gray-200 font-mono px-4 py-12">
            <div className="max-w-3xl mx-auto space-y-8">
                <h2 className="text-2xl font-bold text-purple-400">
                    Панель системного администратора
                </h2>

                {/* Форма создания */}
                <form onSubmit={handleCreateClinic} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                        placeholder="Город"
                        value={form.city}
                        onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                        className="bg-gray-800 border border-gray-700 px-3 py-2 rounded text-gray-100"
                        required
                    />
                    <input
                        placeholder="Название клиники"
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        className="bg-gray-800 border border-gray-700 px-3 py-2 rounded text-gray-100"
                        required
                    />
                    <input
                        placeholder="Адрес"
                        value={form.address}
                        onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                        className="col-span-1 md:col-span-2 bg-gray-800 border border-gray-700 px-3 py-2 rounded text-gray-100"
                        required
                    />
                    <input
                        placeholder="Телефон"
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        className="bg-gray-800 border border-gray-700 px-3 py-2 rounded text-gray-100"
                        required
                    />
                    <select
                        value={form.adminId}
                        onChange={e => setForm(f => ({ ...f, adminId: e.target.value }))}
                        className="bg-gray-800 border border-gray-700 px-3 py-2 rounded text-gray-100"
                    >
                        <option value="">Назначить админа клиники (опционально)</option>
                        {users.map(u => (
                            <option key={u.id} value={u.id}>
                                {u.fullName} ({u.email})
                            </option>
                        ))}
                    </select>

                    <button
                        type="submit"
                        className="col-span-1 md:col-span-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded text-white"
                    >
                        Добавить клинику
                    </button>
                </form>

                {/* Список существующих */}
                {clinics.length === 0 ? (
                    <p>Клиник пока нет.</p>
                ) : (
                    <div className="space-y-4">
                        {clinics.map(clinic => (
                            <div
                                key={clinic.id}
                                className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-4"
                            >
                                <div className="flex-1">
                                    <p className="text-lg">{clinic.name} — <span className="text-sm text-gray-500">{clinic.city}</span></p>
                                    <p className="text-sm text-gray-400">{clinic.address}</p>
                                    <p className="text-sm text-gray-400">📞 {clinic.phone}</p>
                                    <p className="text-sm text-gray-500">
                                        Админ:&nbsp;
                                        {clinic.admin
                                            ? `${clinic.admin.fullName} (${clinic.admin.email})`
                                            : '—'}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <select
                                        value={assignMap[clinic.id] || ''}
                                        onChange={e =>
                                            setAssignMap(m => ({ ...m, [clinic.id]: e.target.value }))
                                        }
                                        className="bg-gray-800 border border-gray-700 px-3 py-2 rounded text-gray-100 text-sm"
                                    >
                                        <option value="">Выберите админа</option>
                                        {users.map(u => (
                                            <option key={u.id} value={u.id}>
                                                {u.fullName} ({u.email})
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => handleAssignAdmin(clinic.id)}
                                        className="px-3 py-2 bg-blue-500 hover:bg-blue-600 rounded text-white text-sm"
                                    >
                                        Назначить
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
