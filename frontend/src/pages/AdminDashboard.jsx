import React, { useEffect, useState } from 'react'
import {
    getClinicStats,
    getPatients,
    getDoctors,
    getAppointments,
    getPayments,
    addDoctor,
    updateDoctor,
    deleteDoctor,
} from '../services/adminService'

const tabs = [
    { key: 'patients',     label: 'Пациенты' },
    { key: 'doctors',      label: 'Врачи' },
    { key: 'appointments', label: 'Записи' },
    { key: 'payments',     label: 'Платежи' },
]

export default function AdminDashboard() {
    const [stats, setStats] = useState({
        patients: 0,
        doctors: 0,
        appointments: 0,
        payments: 0,
    })

    const [patients, setPatients]       = useState([])
    const [doctors, setDoctors]         = useState([])
    const [appointments, setAppointments] = useState([])
    const [payments, setPayments]         = useState([])
    const [activeTab, setActiveTab]       = useState('patients')

    // для формы добавления врача
    const [newDoctorId, setNewDoctorId]     = useState('')
    const [newSpecialization, setNewSpecialization] = useState('')

    useEffect(() => {
        loadAll()
    }, [])

    async function loadAll() {
        try {
            setStats(await getClinicStats())
            setPatients(await getPatients())
            setDoctors(await getDoctors())
            setAppointments(await getAppointments())
            setPayments(await getPayments())
        } catch (err) {
            console.error(err)
            alert('Ошибка загрузки данных')
        }
    }

    async function handleAddDoctor() {
        if (!newDoctorId || !newSpecialization) {
            return alert('Введите ID пользователя и специализацию')
        }
        try {
            await addDoctor({
                userId: parseInt(newDoctorId, 10),
                specialization: newSpecialization,
            })
            setNewDoctorId('')
            setNewSpecialization('')
            setDoctors(await getDoctors())
            setStats(s => ({ ...s, doctors: s.doctors + 1 }))
        } catch (err) {
            alert(err.message)
        }
    }

    async function handleDeleteDoctor(id) {
        if (!window.confirm('Удалить этого врача?')) return
        try {
            await deleteDoctor(id)
            setDoctors(doctors.filter(d => d.id !== id))
            setStats(s => ({ ...s, doctors: s.doctors - 1 }))
        } catch (err) {
            alert(err.message)
        }
    }

    async function handleEditDoctor(id) {
        const spec = prompt('Новая специализация:')
        if (!spec) return
        try {
            await updateDoctor(id, { specialization: spec })
            setDoctors(
                doctors.map(d => (d.id === id ? { ...d, specialization: spec } : d))
            )
        } catch (err) {
            alert(err.message)
        }
    }

    return (
        <div className="min-h-[calc(100vh-128px)] bg-gray-950 text-gray-200 font-mono px-4 py-12">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-3xl font-bold text-purple-400 mb-8">
                    Администрирование клиники
                </h1>

                {/* Статистика */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <StatCard label="Пациенты"   value={stats.patients} />
                    <StatCard label="Врачи"       value={stats.doctors} />
                    <StatCard label="Записи"      value={stats.appointments} />
                    <StatCard label="Платежи"     value={stats.payments} />
                </div>

                {/* Таб-меню */}
                <div className="flex space-x-4 border-b border-gray-800 mb-6">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key)}
                            className={`pb-2 text-sm md:text-base transition ${
                                activeTab === t.key
                                    ? 'text-purple-400 border-b-2 border-purple-400'
                                    : 'text-gray-400 hover:text-purple-400'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Контент таба */}
                <div>
                    {activeTab === 'patients' && <PatientsTable data={patients} />}

                    {activeTab === 'doctors' && (
                        <>
                            {/* Форма добавления врача */}
                            <div className="flex flex-wrap items-center gap-2 mb-4">
                                <input
                                    type="number"
                                    placeholder="ID пользователя"
                                    value={newDoctorId}
                                    onChange={e => setNewDoctorId(e.target.value)}
                                    className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm w-32 focus:ring-2 focus:ring-purple-600"
                                />
                                <input
                                    type="text"
                                    placeholder="Специализация"
                                    value={newSpecialization}
                                    onChange={e => setNewSpecialization(e.target.value)}
                                    className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm w-40 focus:ring-2 focus:ring-purple-600"
                                />
                                <button
                                    onClick={handleAddDoctor}
                                    className="bg-green-600 hover:bg-green-500 transition rounded-lg px-4 py-2 text-white text-sm"
                                >
                                    Добавить
                                </button>
                            </div>
                            <DoctorsTable
                                data={doctors}
                                onDelete={handleDeleteDoctor}
                                onEdit={handleEditDoctor}
                            />
                        </>
                    )}

                    {activeTab === 'appointments' && (
                        <AppointmentsTable data={appointments} />
                    )}

                    {activeTab === 'payments' && <PaymentsTable data={payments} />}
                </div>
            </div>
        </div>
    )
}

// ———————————————————————————————————————————————————————————————
// Компоненты таблиц и карточки статистики
// ———————————————————————————————————————————————————————————————

function StatCard({ label, value }) {
    return (
        <div className="bg-gray-900 p-4 rounded-lg text-center">
            <p className="text-sm text-gray-400">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
        </div>
    )
}

function PatientsTable({ data }) {
    return (
        <SimpleTable
            columns={['ID', 'ФИО', 'Email']}
            rows={data.map(u => [u.id, u.full_name, u.email])}
        />
    )
}

function DoctorsTable({ data, onDelete, onEdit }) {
    return (
        <table className="w-full table-auto bg-gray-900 rounded-lg overflow-hidden">
            <thead className="bg-gray-800">
            <tr>
                <th className="px-4 py-2 text-left text-gray-400">ID</th>
                <th className="px-4 py-2 text-left text-gray-400">ФИО</th>
                <th className="px-4 py-2 text-left text-gray-400">Специализация</th>
                <th className="px-4 py-2 text-left text-gray-400">Действия</th>
            </tr>
            </thead>
            <tbody>
            {data.map(d => (
                <tr key={d.id} className="border-b border-gray-800">
                    <td className="px-4 py-2">{d.id}</td>
                    <td className="px-4 py-2">{d.full_name}</td>
                    <td className="px-4 py-2">{d.specialization}</td>
                    <td className="px-4 py-2">
                        <div className="flex gap-2">
                            <button
                                onClick={() => onEdit(d.id)}
                                className="bg-blue-600 hover:bg-blue-500 transition rounded px-3 py-1 text-white text-sm"
                            >
                                Ред.
                            </button>
                            <button
                                onClick={() => onDelete(d.id)}
                                className="bg-red-600 hover:bg-red-500 transition rounded px-3 py-1 text-white text-sm"
                            >
                                Удл.
                            </button>
                        </div>
                    </td>
                </tr>
            ))}
            {data.length === 0 && (
                <tr>
                    <td colSpan="4" className="p-4 text-center text-gray-500">
                        Нет данных
                    </td>
                </tr>
            )}
            </tbody>
        </table>
    )
}

function AppointmentsTable({ data }) {
    return (
        <SimpleTable
            columns={['ID', 'Пациент', 'Врач', 'Дата', 'Статус']}
            rows={data.map(a => [
                a.id,
                a.patient_name,
                a.doctor_name,
                `${a.date} ${a.time}`,
                a.status,
            ])}
        />
    )
}

function PaymentsTable({ data }) {
    return (
        <SimpleTable
            columns={['ID', 'Приём ID', 'Сумма', 'Статус']}
            rows={data.map(p => [p.id, p.appointment_id, p.amount, p.status])}
        />
    )
}

function SimpleTable({ columns, rows }) {
    return (
        <table className="w-full table-auto bg-gray-900 rounded-lg overflow-hidden">
            <thead className="bg-gray-800">
            <tr>
                {columns.map(col => (
                    <th key={col} className="px-4 py-2 text-left text-gray-400">
                        {col}
                    </th>
                ))}
            </tr>
            </thead>
            <tbody>
            {rows.map((cells, i) => (
                <tr key={i} className="border-b border-gray-800">
                    {cells.map((cell, j) => (
                        <td key={j} className="px-4 py-2">
                            {cell}
                        </td>
                    ))}
                </tr>
            ))}
            {rows.length === 0 && (
                <tr>
                    <td colSpan={columns.length} className="p-4 text-center text-gray-500">
                        Нет данных
                    </td>
                </tr>
            )}
            </tbody>
        </table>
    )
}
