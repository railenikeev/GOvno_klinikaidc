// src/pages/ProfilePage.jsx
import React, { useEffect, useState } from 'react'
import {
    getProfile,
    updateProfile,
    changePassword,
    getNotificationSettings,
    updateNotificationSettings,
} from '../services/profileService'

export default function ProfilePage() {
    const [profile, setProfile] = useState(null)
    const [form, setForm] = useState({ fullName: '', email: '' })
    const [passForm, setPassForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    })
    const [settings, setSettings] = useState({ email: false, sms: false, push: false })

    useEffect(() => {
        loadProfile()
        loadSettings()
    }, [])

    async function loadProfile() {
        try {
            const data = await getProfile()
            setProfile(data)
            setForm({ fullName: data.fullName, email: data.email })
        } catch (err) {
            alert(err.message)
        }
    }

    async function loadSettings() {
        try {
            const s = await getNotificationSettings()
            setSettings(s)
        } catch (err) {
            alert(err.message)
        }
    }

    async function handleSaveProfile(e) {
        e.preventDefault()
        try {
            await updateProfile(form)
            alert('Профиль сохранён')
            loadProfile()
        } catch (err) {
            alert(err.message)
        }
    }

    async function handleChangePassword(e) {
        e.preventDefault()
        try {
            await changePassword(passForm)
            alert('Пароль успешно изменён')
            setPassForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
        } catch (err) {
            alert(err.message)
        }
    }

    async function handleSaveSettings(e) {
        e.preventDefault()
        try {
            await updateNotificationSettings(settings)
            alert('Настройки уведомлений сохранены')
        } catch (err) {
            alert(err.message)
        }
    }

    if (!profile) return <p>Загрузка...</p>

    return (
        <div className="max-w-2xl mx-auto py-8 space-y-8">
            <h1 className="text-3xl font-bold">Профиль</h1>

            <div className="bg-gray-800 p-6 rounded-lg space-y-4">
                <p><strong>ID:</strong> {profile.id}</p>
                <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div>
                        <label className="block text-sm mb-1">ФИО</label>
                        <input
                            type="text"
                            value={form.fullName}
                            onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                            className="w-full bg-gray-900 px-3 py-2 rounded"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Email</label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                            className="w-full bg-gray-900 px-3 py-2 rounded"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-purple-500 rounded hover:bg-purple-600"
                    >
                        Сохранить профиль
                    </button>
                </form>
            </div>

            <div className="bg-gray-800 p-6 rounded-lg space-y-4">
                <h2 className="text-xl font-semibold">Сменить пароль</h2>
                <form onSubmit={handleChangePassword} className="space-y-4">
                    <div>
                        <label className="block text-sm mb-1">Текущий пароль</label>
                        <input
                            type="password"
                            value={passForm.currentPassword}
                            onChange={e =>
                                setPassForm(p => ({ ...p, currentPassword: e.target.value }))
                            }
                            className="w-full bg-gray-900 px-3 py-2 rounded"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Новый пароль</label>
                        <input
                            type="password"
                            value={passForm.newPassword}
                            onChange={e => setPassForm(p => ({ ...p, newPassword: e.target.value }))}
                            className="w-full bg-gray-900 px-3 py-2 rounded"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Подтвердите пароль</label>
                        <input
                            type="password"
                            value={passForm.confirmPassword}
                            onChange={e =>
                                setPassForm(p => ({ ...p, confirmPassword: e.target.value }))
                            }
                            className="w-full bg-gray-900 px-3 py-2 rounded"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-purple-500 rounded hover:bg-purple-600"
                    >
                        Сменить пароль
                    </button>
                </form>
            </div>

            <div className="bg-gray-800 p-6 rounded-lg space-y-4">
                <h2 className="text-xl font-semibold">Уведомления</h2>
                <form onSubmit={handleSaveSettings} className="space-y-2">
                    {['email', 'sms', 'push'].map(type => (
                        <label key={type} className="inline-flex items-center space-x-2">
                            <input
                                type="checkbox"
                                checked={settings[type]}
                                onChange={e =>
                                    setSettings(s => ({ ...s, [type]: e.target.checked }))
                                }
                                className="form-checkbox"
                            />
                            <span className="capitalize">{type}-уведомления</span>
                        </label>
                    ))}
                    <div>
                        <button
                            type="submit"
                            className="mt-4 px-4 py-2 bg-purple-500 rounded hover:bg-purple-600"
                        >
                            Сохранить настройки
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
