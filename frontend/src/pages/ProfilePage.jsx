// src/pages/ProfilePage.jsx
import React, { useState, useEffect } from 'react'
import {
    getProfile,
    updateProfile,
    changePassword
} from '../services/profileService'

export default function ProfilePage() {
    const [loading, setLoading] = useState(true)
    const [profile, setProfile] = useState(null)
    const [form, setForm] = useState({ full_name: '', email: '' })
    const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' })
    const [error, setError] = useState('')

    useEffect(() => {
        async function load() {
            try {
                const data = await getProfile()
                setProfile(data)
                setForm({ full_name: data.full_name, email: data.email })
            } catch (e) {
                setError(e.message)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    const handleProfileSave = async () => {
        try {
            await updateProfile(form)
            alert('Профиль обновлён')
        } catch (e) {
            alert('Ошибка: ' + e.message)
        }
    }

    const handlePasswordSave = async () => {
        if (passwords.new !== passwords.confirm) {
            alert('Новый пароль и подтверждение не совпадают')
            return
        }
        try {
            await changePassword({
                current_password: passwords.current,
                new_password: passwords.new
            })
            alert('Пароль успешно изменён')
            setPasswords({ current: '', new: '', confirm: '' })
        } catch (e) {
            alert('Ошибка: ' + e.message)
        }
    }

    if (loading) return <div>Загрузка...</div>
    if (error) return <div className="error">Ошибка: {error}</div>

    return (
        <div className="profile-page" style={{ maxWidth: 600, margin: '0 auto', padding: 20 }}>
            <h1>Профиль пользователя</h1>

            <div style={{
                marginBottom: 20,
                padding: 15,
                border: '1px solid #444',
                borderRadius: 4,
                background: '#1e1e2f'
            }}>
                <p><strong>ID:</strong> {profile.id}</p>
                <p><strong>Роль:</strong> {profile.role}</p>
                <p><strong>Телефон:</strong> {profile.phone || '—'}</p>
            </div>

            <section style={{ marginBottom: 30 }}>
                <h2>Редактировать данные</h2>
                <label style={{ display: 'block', marginBottom: 10 }}>
                    ФИО
                    <input
                        type="text"
                        value={form.full_name}
                        onChange={e => setForm({ ...form, full_name: e.target.value })}
                        style={{ width: '100%', padding: 8, marginTop: 5 }}
                    />
                </label>
                <label style={{ display: 'block', marginBottom: 10 }}>
                    Email
                    <input
                        type="email"
                        value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })}
                        style={{ width: '100%', padding: 8, marginTop: 5 }}
                    />
                </label>
                <button onClick={handleProfileSave} style={{ marginTop: 10 }}>
                    Сохранить профиль
                </button>
            </section>

            <section>
                <h2>Сменить пароль</h2>
                <label style={{ display: 'block', marginBottom: 10 }}>
                    Текущий пароль
                    <input
                        type="password"
                        value={passwords.current}
                        onChange={e => setPasswords({ ...passwords, current: e.target.value })}
                        style={{ width: '100%', padding: 8, marginTop: 5 }}
                    />
                </label>
                <label style={{ display: 'block', marginBottom: 10 }}>
                    Новый пароль
                    <input
                        type="password"
                        value={passwords.new}
                        onChange={e => setPasswords({ ...passwords, new: e.target.value })}
                        style={{ width: '100%', padding: 8, marginTop: 5 }}
                    />
                </label>
                <label style={{ display: 'block', marginBottom: 10 }}>
                    Подтвердите новый пароль
                    <input
                        type="password"
                        value={passwords.confirm}
                        onChange={e => setPasswords({ ...passwords, confirm: e.target.value })}
                        style={{ width: '100%', padding: 8, marginTop: 5 }}
                    />
                </label>
                <button onClick={handlePasswordSave} style={{ marginTop: 10 }}>
                    Сменить пароль
                </button>
            </section>
        </div>
    )
}
