// frontend/src/pages/SystemAdminDashboard.jsx
import React, { useEffect, useState } from 'react';
import {
    getClinics,
    createClinic,
    assignClinicAdmin,
    removeClinicAdmin,
    deleteClinic,
    updateClinic,
} from '../services/clinicService';

export default function SystemAdminDashboard() {
    const [clinics, setClinics] = useState([]);
    const [form, setForm] = useState({ city: '', name: '', address: '', phone: '' });
    const [assignMap, setAssignMap] = useState({});
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ city: '', name: '', address: '', phone: '' });

    useEffect(() => {
        loadClinics();
    }, []);

    async function loadClinics() {
        try {
            const data = await getClinics();
            setClinics(Array.isArray(data) ? data : []);
        } catch {
            alert('Ошибка загрузки клиник');
        }
    }

    /* ---------- создание клиники ---------- */

    async function handleCreateClinic(e) {
        e.preventDefault();
        try {
            await createClinic(form);
            setForm({ city: '', name: '', address: '', phone: '' });
            await loadClinics();
        } catch (err) {
            alert(err.message);
        }
    }

    /* ---------- назначение / снятие админа ---------- */

    async function handleAssignAdmin(clinicId) {
        const userId = assignMap[clinicId];
        if (!userId) return alert('Введите ID администратора');
        try {
            await assignClinicAdmin(clinicId, userId);
            await loadClinics();
        } catch (err) {
            alert(err.message);
        }
    }

    async function handleRemoveAdmin(clinicId) {
        try {
            await removeClinicAdmin(clinicId);
            await loadClinics();
        } catch (err) {
            alert(err.message);
        }
    }

    /* ---------- удаление и редактирование ---------- */

    async function handleDeleteClinic(clinicId) {
        if (!window.confirm('Удалить эту клинику?')) return;
        try {
            await deleteClinic(clinicId);
            await loadClinics();
        } catch (err) {
            alert(err.message);
        }
    }

    function startEditing(clinic) {
        setEditingId(clinic.id);
        setEditForm({
            city: clinic.city,
            name: clinic.name,
            address: clinic.address,
            phone: clinic.phone,
        });
    }

    async function saveEdit(clinicId) {
        try {
            await updateClinic(clinicId, editForm);
            setEditingId(null);
            await loadClinics();
        } catch (err) {
            alert(err.message);
        }
    }

    /* ---------- UI ---------- */

    return (
        <div className="container mx-auto max-w-4xl px-4 py-6">
            <h1 className="text-2xl font-semibold mb-6 text-white">
                Панель системного администратора
            </h1>

            {/* форма создания */}
            <form
                onSubmit={handleCreateClinic}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8"
            >
                <input
                    type="text"
                    placeholder="Город"
                    value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-gray-100 focus:ring-2 focus:ring-purple-600"
                    required
                />
                <input
                    type="text"
                    placeholder="Название клиники"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-gray-100 focus:ring-2 focus:ring-purple-600"
                    required
                />
                <input
                    type="text"
                    placeholder="Адрес"
                    value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-gray-100 focus:ring-2 focus:ring-purple-600 md:col-span-2"
                    required
                />
                <input
                    type="text"
                    placeholder="Телефон"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    maxLength={11}
                    pattern="\d{11}"
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-gray-100 focus:ring-2 focus:ring-purple-600"
                    required
                />
                <button
                    type="submit"
                    className="md:col-span-2 bg-purple-600 hover:bg-purple-500 transition rounded-lg px-4 py-2 text-white font-medium"
                >
                    Добавить клинику
                </button>
            </form>

            {/* список клиник */}
            <div className="space-y-6">
                {clinics.map(cl => (
                    <div
                        key={cl.id}
                        className="bg-gray-800 hover:bg-gray-700 transition-shadow shadow-lg hover:shadow-2xl rounded-xl p-6"
                    >
                        {editingId === cl.id ? (
                            /* режим редактирования */
                            <div className="space-y-3">
                                {['city', 'name', 'address', 'phone'].map(f => (
                                    <input
                                        key={f}
                                        type="text"
                                        value={editForm[f]}
                                        onChange={e => setEditForm(v => ({ ...v, [f]: e.target.value }))}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-100"
                                    />
                                ))}

                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={() => saveEdit(cl.id)}
                                        className="bg-green-500 hover:bg-green-400 text-white font-medium rounded-md px-4 py-2 text-sm"
                                    >
                                        Сохранить
                                    </button>
                                    <button
                                        onClick={() => setEditingId(null)}
                                        className="bg-gray-600 hover:bg-gray-500 text-white font-medium rounded-md px-4 py-2 text-sm"
                                    >
                                        Отменить
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* обычный режим */
                            <>
                                <h2 className="text-xl font-semibold text-white mb-2">
                                    {cl.name} <span className="text-gray-400">— {cl.city}</span>
                                </h2>
                                <p className="text-gray-300 mb-1">{cl.address}</p>
                                <p className="text-gray-300 mb-3">{cl.phone}</p>
                                <p className="text-gray-300 mb-4">
                                    <span className="font-medium">Админ:</span>{' '}
                                    {cl.admin ? (
                                        <>
                                            {cl.admin.fullName} ({cl.admin.email})
                                            <button
                                                onClick={() => handleRemoveAdmin(cl.id)}
                                                className="ml-3 bg-red-600 hover:bg-red-500 text-white rounded-md px-3 py-1 text-xs"
                                            >
                                                Снять
                                            </button>
                                        </>
                                    ) : (
                                        '—'
                                    )}
                                </p>

                                {/* назначение показываем, когда админа нет */}
                                {!cl.admin && (
                                    <div className="mt-4 flex flex-wrap items-center gap-3">
                                        <input
                                            type="text"
                                            placeholder="ID администратора"
                                            onChange={e =>
                                                setAssignMap(m => ({
                                                    ...m,
                                                    [cl.id]: Number(e.target.value),
                                                }))
                                            }
                                            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:ring-2 focus:ring-purple-600 text-sm w-36"
                                        />
                                        <button
                                            onClick={() => handleAssignAdmin(cl.id)}
                                            className="bg-purple-600 hover:bg-purple-500 transition rounded-lg px-4 py-2 text-white text-sm"
                                        >
                                            Назначить
                                        </button>
                                    </div>
                                )}

                                <div className="mt-4 flex justify-end gap-2">
                                    <button
                                        onClick={() => startEditing(cl)}
                                        className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-medium rounded-md px-4 py-2 text-sm"
                                    >
                                        Редактировать
                                    </button>
                                    <button
                                        onClick={() => handleDeleteClinic(cl.id)}
                                        className="bg-red-600 hover:bg-red-500 text-white font-medium rounded-md px-4 py-2 text-sm"
                                    >
                                        Удалить
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
