// frontend/src/pages/SystemAdminDashboard.jsx
import React, { useEffect, useState } from 'react'
import {
    getClinics,
    createClinic,
    assignClinicAdmin,
    deleteClinic,    // <-- импорт
    updateClinic,    // <-- импорт
} from '../services/clinicService'

export default function SystemAdminDashboard() {
    const [clinics, setClinics] = useState([])
    const [form, setForm] = useState({ city: '', name: '', address: '', phone: '' })
    const [assignMap, setAssignMap] = useState({})

    // Для редактирования
    const [editingId, setEditingId] = useState(null)
    const [editForm, setEditForm] = useState({ city: '', name: '', address: '', phone: '' })

    useEffect(() => {
        loadClinics()
    }, [])

    async function loadClinics() {
        try {
            const data = await getClinics()
            setClinics(Array.isArray(data) ? data : [])
        } catch {
            alert('Ошибка загрузки клиник')
        }
    }

    async function handleCreateClinic(e) {
        e.preventDefault()
        try {
            await createClinic(form)
            setForm({ city: '', name: '', address: '', phone: '' })
            loadClinics()
        } catch (err) {
            alert(err.message)
        }
    }

    async function handleAssignAdmin(clinicId) {
        const userId = assignMap[clinicId]
        if (!userId) return alert('Введите ID администратора')
        try {
            await assignClinicAdmin(clinicId, userId)
            alert('Администратор назначен')
            loadClinics()
        } catch (err) {
            alert(err.message)
        }
    }

    // **Новое**: удалить
    async function handleDeleteClinic(id) {
        if (!window.confirm('Удалить эту клинику?')) return
        try {
            await deleteClinic(id)
            loadClinics()
        } catch (err) {
            alert(err.message)
        }
    }

    // **Новое**: начать редактирование
    function handleEditClick(clinic) {
        setEditingId(clinic.id)
        setEditForm({
            city: clinic.city,
            name: clinic.name,
            address: clinic.address,
            phone: clinic.phone,
        })
    }

    // **Новое**: сохранить изменения
    async function handleSaveEdit(id) {
        try {
            await updateClinic(id, editForm)
            setEditingId(null)
            loadClinics()
        } catch (err) {
            alert(err.message)
        }
    }

    // **Новое**: отменить редактирование
    function handleCancelEdit() {
        setEditingId(null)
    }

    return (
        <div className="container mx-auto max-w-4xl px-4 py-6">
            <h1 className="text-2xl font-semibold mb-6 text-white">
                Панель системного администратора
            </h1>

            {/* Форма создания клиники */}
            <form
                onSubmit={handleCreateClinic}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8"
            >
                {['city','name','address','phone'].map((field, i) => (
                    <input
                        key={field}
                        type="text"
                        placeholder={['Город','Название клиники','Адрес','Телефон'][i]}
                        value={form[field]}
                        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-gray-100 focus:ring-2 focus:ring-purple-600"
                        required
                    />
                ))}
                <button
                    type="submit"
                    className="md:col-span-2 bg-purple-600 hover:bg-purple-500 transition rounded-lg px-4 py-2 text-white font-medium"
                >
                    Добавить клинику
                </button>
            </form>

            {/* Список клиник */}
            <div className="space-y-6">
                {clinics.map(clinic => {
                    const isEditing = editingId === clinic.id
                    return (
                        <div
                            key={clinic.id}
                            className="bg-gray-800 hover:bg-gray-700 transition-shadow shadow-lg rounded-xl p-6"
                        >
                            {isEditing ? (
                                <>
                                    {/* Поля редактирования */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                                        {['city','name','address','phone'].map((field, i) => (
                                            <input
                                                key={field}
                                                type="text"
                                                placeholder={field}
                                                value={editForm[field]}
                                                onChange={e =>
                                                    setEditForm(f => ({ ...f, [field]: e.target.value }))
                                                }
                                                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:ring-2 focus:ring-purple-600"
                                            />
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleSaveEdit(clinic.id)}
                                            className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg text-white text-sm"
                                        >
                                            Сохранить
                                        </button>
                                        <button
                                            onClick={handleCancelEdit}
                                            className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded-lg text-white text-sm"
                                        >
                                            Отменить
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h2 className="text-xl font-semibold text-white mb-2">
                                        {clinic.name}{' '}
                                        <span className="text-gray-400">— {clinic.city}</span>
                                    </h2>
                                    <p className="text-gray-300 mb-1">{clinic.address}</p>
                                    <p className="text-gray-300 mb-3">{clinic.phone}</p>
                                    <p className="text-gray-300 mb-4">
                                        <span className="font-medium">Админ:</span>{' '}
                                        {clinic.admin
                                            ? `${clinic.admin.fullName} (${clinic.admin.email})`
                                            : '—'}
                                    </p>

                                    <div className="flex flex-wrap items-center gap-3 mb-4">
                                        <input
                                            type="text"
                                            placeholder="ID администратора"
                                            onChange={e =>
                                                setAssignMap(m => ({ ...m, [clinic.id]: e.target.value }))
                                            }
                                            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:ring-2 focus:ring-purple-600 text-sm w-36"
                                        />
                                        <button
                                            onClick={() => handleAssignAdmin(clinic.id)}
                                            className="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-lg text-white text-sm"
                                        >
                                            Назначить
                                        </button>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleEditClick(clinic)}
                                            className="bg-yellow-600 hover:bg-yellow-500 px-4 py-2 rounded-lg text-white text-sm"
                                        >
                                            Ред.
                                        </button>
                                        <button
                                            onClick={() => handleDeleteClinic(clinic.id)}
                                            className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg text-white text-sm"
                                        >
                                            Удалить
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
