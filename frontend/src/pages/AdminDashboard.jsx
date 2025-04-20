// src/pages/AdminDashboard.jsx
import React, { useEffect, useState } from 'react'
import {
    getClinicStats,
    getPatients,
    getDoctors,
    getAppointments,
    getPayments,
} from '../services/adminService' // <-- ваш сервис

const tabs = [
    { key: 'patients', label: 'Пациенты' },
    { key: 'doctors', label: 'Врачи' },
    { key: 'appointments', label: 'Записи' },
    { key: 'payments', label: 'Платежи' },
]

export default function AdminDashboard() {
    const [stats, setStats] = useState({
        patients: 0,
        doctors: 0,
        appointments: 0,
        payments: 0,
    })
    const [patients, setPatients] = useState([])
    const [doctors, setDoctors] = useState([])
    const [appointments, setAppointments] = useState([])
    const [payments, setPayments] = useState([])
    const [activeTab, setActiveTab] = useState('patients')

    useEffect(() => {
        // Замените на реальные вызовы
        getClinicStats().then(setStats).catch(() => {})
        getPatients().then(setPatients).catch(() => {})
        getDoctors().then(setDoctors).catch(() => {})
        getAppointments().then(setAppointments).catch(() => {})
        getPayments().then(setPayments).catch(() => {})
    }, [])

    return (
        <div className="min-h-[calc(100vh-128px)] bg-gray-950 text-gray-200 font-mono px-4 py-12">
            <div className="max-w-6xl mx-auto">
                {/* Заголовок */}
                <h1 className="text-3xl font-bold text-purple-400 mb-8">
                    Администрирование клиники
                </h1>

                {/* Статистика */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-gray-900 p-4 rounded-lg text-center">
                        <p className="text-sm text-gray-400">Пациенты</p>
                        <p className="text-2xl font-semibold">{stats.patients}</p>
                    </div>
                    <div className="bg-gray-900 p-4 rounded-lg text-center">
                        <p className="text-sm text-gray-400">Врачи</p>
                        <p className="text-2xl font-semibold">{stats.doctors}</p>
                    </div>
                    <div className="bg-gray-900 p-4 rounded-lg text-center">
                        <p className="text-sm text-gray-400">Записи</p>
                        <p className="text-2xl font-semibold">{stats.appointments}</p>
                    </div>
                    <div className="bg-gray-900 p-4 rounded-lg text-center">
                        <p className="text-sm text-gray-400">Платежи</p>
                        <p className="text-2xl font-semibold">{stats.payments}</p>
                    </div>
                </div>

                {/* Таб-меню */}
                <div className="flex space-x-4 border-b border-gray-800 mb-6">
                    {tabs.map((t) => (
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
                    {activeTab === 'patients' && (
                        <table className="w-full table-auto bg-gray-900 rounded-lg overflow-hidden">
                            <thead className="bg-gray-800">
                            <tr>
                                <th className="px-4 py-2 text-left text-gray-400">ID</th>
                                <th className="px-4 py-2 text-left text-gray-400">ФИО</th>
                                <th className="px-4 py-2 text-left text-gray-400">Email</th>
                            </tr>
                            </thead>
                            <tbody>
                            {patients.map((u) => (
                                <tr key={u.id} className="border-b border-gray-800">
                                    <td className="px-4 py-2">{u.id}</td>
                                    <td className="px-4 py-2">{u.full_name}</td>
                                    <td className="px-4 py-2">{u.email}</td>
                                </tr>
                            ))}
                            {patients.length === 0 && (
                                <tr>
                                    <td colSpan="3" className="p-4 text-center text-gray-500">
                                        Нет данных
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'doctors' && (
                        <table className="w-full table-auto bg-gray-900 rounded-lg overflow-hidden">
                            <thead className="bg-gray-800">
                            <tr>
                                <th className="px-4 py-2 text-left text-gray-400">ID</th>
                                <th className="px-4 py-2 text-left text-gray-400">ФИО</th>
                                <th className="px-4 py-2 text-left text-gray-400">Специализация</th>
                            </tr>
                            </thead>
                            <tbody>
                            {doctors.map((d) => (
                                <tr key={d.id} className="border-b border-gray-800">
                                    <td className="px-4 py-2">{d.id}</td>
                                    <td className="px-4 py-2">{d.full_name}</td>
                                    <td className="px-4 py-2">{d.specialization}</td>
                                </tr>
                            ))}
                            {doctors.length === 0 && (
                                <tr>
                                    <td colSpan="3" className="p-4 text-center text-gray-500">
                                        Нет данных
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'appointments' && (
                        <table className="w-full table-auto bg-gray-900 rounded-lg overflow-hidden">
                            <thead className="bg-gray-800">
                            <tr>
                                <th className="px-4 py-2 text-left text-gray-400">ID</th>
                                <th className="px-4 py-2 text-left text-gray-400">Пациент</th>
                                <th className="px-4 py-2 text-left text-gray-400">Врач</th>
                                <th className="px-4 py-2 text-left text-gray-400">Дата</th>
                                <th className="px-4 py-2 text-left text-gray-400">Статус</th>
                            </tr>
                            </thead>
                            <tbody>
                            {appointments.map((a) => (
                                <tr key={a.id} className="border-b border-gray-800">
                                    <td className="px-4 py-2">{a.id}</td>
                                    <td className="px-4 py-2">{a.patient_name}</td>
                                    <td className="px-4 py-2">{a.doctor_name}</td>
                                    <td className="px-4 py-2">{a.date} {a.time}</td>
                                    <td className="px-4 py-2">{a.status}</td>
                                </tr>
                            ))}
                            {appointments.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="p-4 text-center text-gray-500">
                                        Нет данных
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'payments' && (
                        <table className="w-full table-auto bg-gray-900 rounded-lg overflow-hidden">
                            <thead className="bg-gray-800">
                            <tr>
                                <th className="px-4 py-2 text-left text-gray-400">ID</th>
                                <th className="px-4 py-2 text-left text-gray-400">Приём ID</th>
                                <th className="px-4 py-2 text-left text-gray-400">Сумма</th>
                                <th className="px-4 py-2 text-left text-gray-400">Статус</th>
                            </tr>
                            </thead>
                            <tbody>
                            {payments.map((p) => (
                                <tr key={p.id} className="border-b border-gray-800">
                                    <td className="px-4 py-2">{p.id}</td>
                                    <td className="px-4 py-2">{p.appointment_id}</td>
                                    <td className="px-4 py-2">{p.amount}</td>
                                    <td className="px-4 py-2">{p.status}</td>
                                </tr>
                            ))}
                            {payments.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="p-4 text-center text-gray-500">
                                        Нет данных
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}
