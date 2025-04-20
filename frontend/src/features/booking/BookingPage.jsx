// frontend/src/features/booking/BookingPage.jsx
import React, { useEffect, useState } from 'react'
import { getClinics } from '../../services/clinicService'

export default function BookingPage() {
    const [clinics, setClinics] = useState([])
    const [selectedClinic, setSelectedClinic] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        async function fetchClinicsList() {
            try {
                const data = await getClinics()
                setClinics(data)
            } catch (e) {
                setError(e.message)
            } finally {
                setLoading(false)
            }
        }
        fetchClinicsList()
    }, [])

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <span className="text-gray-400">Загрузка списка клиник…</span>
            </div>
        )
    }

    if (error) {
        return (
            <div className="max-w-md mx-auto p-4 bg-red-900 rounded">
                <p className="text-red-400">Ошибка: {error}</p>
            </div>
        )
    }

    return (
        <div className="max-w-3xl mx-auto px-4 py-8">
            <h1 className="text-3xl font-semibold text-white mb-8">Онлайн‑запись на приём</h1>

            <div className="mb-6">
                <label
                    htmlFor="clinic-select"
                    className="block text-sm font-medium text-gray-300 mb-2"
                >
                    Выберите клинику
                </label>
                <select
                    id="clinic-select"
                    value={selectedClinic}
                    onChange={(e) => setSelectedClinic(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                >
                    <option value="" disabled>
                        -- выберите клинику --
                    </option>
                    {clinics.map((clinic) => (
                        <option key={clinic.id} value={clinic.id}>
                            {clinic.name} — {clinic.city}
                        </option>
                    ))}
                </select>
            </div>

            {selectedClinic && (
                <div className="mt-8 p-6 bg-gray-800 rounded border border-gray-700">
                    <p className="text-gray-200">
                        Вы выбрали клинику: <span className="font-medium text-white">{clinics.find(c => c.id === +selectedClinic)?.name}</span>
                    </p>
                    <button
                        onClick={() => {/* здесь переход к следующему шагу */}}
                        className="mt-4 inline-block bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                        Далее &rarr;
                    </button>
                </div>
            )}
        </div>
    )
}
