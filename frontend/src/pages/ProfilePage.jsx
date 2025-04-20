// src/pages/ProfilePage.jsx
import React, { useEffect, useState } from 'react';
import {
    getProfile,
    updateProfile,
    changePassword,
    getNotificationSettings,
    updateNotificationSettings,
} from '../services/profileService.js';

export default function ProfilePage() {
    const [profile, setProfile] = useState({ fullName: '', email: '' });
    const [form, setForm] = useState({ fullName: '', email: '' });
    const [passwords, setPasswords] = useState({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
    });
    const [notifications, setNotifications] = useState({
        email: false,
        sms: false,
        push: false,
    });

    useEffect(() => {
        // Загрузить профиль пользователя
        getProfile()
            .then((data) => {
                setProfile(data);
                setForm({ fullName: data.fullName, email: data.email });
            })
            .catch(() => alert('Ошибка загрузки профиля'));

        // Загрузить настройки уведомлений
        getNotificationSettings()
            .then(setNotifications)
            .catch(() => alert('Ошибка загрузки настроек уведомлений'));
    }, []);

    const handleProfileSave = async (e) => {
        e.preventDefault();
        try {
            await updateProfile(form);
            setProfile(form);
            alert('Профиль сохранён');
        } catch (err) {
            alert(err.message || 'Ошибка при сохранении профиля');
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (passwords.newPassword !== passwords.confirmNewPassword) {
            return alert('Новый пароль и подтверждение не совпадают');
        }
        try {
            await changePassword({
                currentPassword: passwords.currentPassword,
                newPassword: passwords.newPassword,
            });
            setPasswords({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
            alert('Пароль успешно изменён');
        } catch (err) {
            alert(err.message || 'Ошибка при смене пароля');
        }
    };

    const handleNotificationsSave = async () => {
        try {
            await updateNotificationSettings(notifications);
            alert('Настройки уведомлений сохранены');
        } catch (err) {
            alert(err.message || 'Ошибка при сохранении настроек уведомлений');
        }
    };

    return (
        <div className="min-h-[calc(100vh-128px)] bg-gray-950 text-gray-200 font-mono px-4 py-12">
            <div className="max-w-2xl mx-auto space-y-12">
                <h2 className="text-2xl font-bold text-purple-400">Профиль</h2>

                {/* Редактирование профиля */}
                <form onSubmit={handleProfileSave} className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">ФИО</label>
                        <input
                            type="text"
                            value={form.fullName}
                            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                            className="w-full bg-gray-800 border border-gray-700 px-3 py-2 rounded text-gray-100"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Email</label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                            className="w-full bg-gray-800 border border-gray-700 px-3 py-2 rounded text-gray-100"
                        />
                    </div>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded text-white"
                    >
                        Сохранить профиль
                    </button>
                </form>

                {/* Смена пароля */}
                <form onSubmit={handleChangePassword} className="space-y-4">
                    <h3 className="text-xl font-semibold text-gray-200">Сменить пароль</h3>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Текущий пароль</label>
                        <input
                            type="password"
                            value={passwords.currentPassword}
                            onChange={(e) =>
                                setPasswords((p) => ({ ...p, currentPassword: e.target.value }))
                            }
                            className="w-full bg-gray-800 border border-gray-700 px-3 py-2 rounded text-gray-100"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Новый пароль</label>
                        <input
                            type="password"
                            value={passwords.newPassword}
                            onChange={(e) =>
                                setPasswords((p) => ({ ...p, newPassword: e.target.value }))
                            }
                            className="w-full bg-gray-800 border border-gray-700 px-3 py-2 rounded text-gray-100"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">
                            Подтвердите новый пароль
                        </label>
                        <input
                            type="password"
                            value={passwords.confirmNewPassword}
                            onChange={(e) =>
                                setPasswords((p) => ({ ...p, confirmNewPassword: e.target.value }))
                            }
                            className="w-full bg-gray-800 border border-gray-700 px-3 py-2 rounded text-gray-100"
                        />
                    </div>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded text-white"
                    >
                        Сменить пароль
                    </button>
                </form>

                {/* Настройки уведомлений */}
                <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-gray-200">Уведомления</h3>
                    <div className="flex flex-col space-y-2">
                        <label className="inline-flex items-center">
                            <input
                                type="checkbox"
                                checked={notifications.email}
                                onChange={(e) =>
                                    setNotifications((n) => ({ ...n, email: e.target.checked }))
                                }
                                className="form-checkbox h-5 w-5 text-purple-500 bg-gray-800 border-gray-700 rounded"
                            />
                            <span className="ml-2 text-gray-200">Email-уведомления</span>
                        </label>
                        <label className="inline-flex items-center">
                            <input
                                type="checkbox"
                                checked={notifications.sms}
                                onChange={(e) =>
                                    setNotifications((n) => ({ ...n, sms: e.target.checked }))
                                }
                                className="form-checkbox h-5 w-5 text-purple-500 bg-gray-800 border-gray-700 rounded"
                            />
                            <span className="ml-2 text-gray-200">SMS-уведомления</span>
                        </label>
                        <label className="inline-flex items-center">
                            <input
                                type="checkbox"
                                checked={notifications.push}
                                onChange={(e) =>
                                    setNotifications((n) => ({ ...n, push: e.target.checked }))
                                }
                                className="form-checkbox h-5 w-5 text-purple-500 bg-gray-800 border-gray-700 rounded"
                            />
                            <span className="ml-2 text-gray-200">Push-уведомления</span>
                        </label>
                    </div>
                    <button
                        onClick={handleNotificationsSave}
                        className="px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded text-white"
                    >
                        Сохранить настройки
                    </button>
                </div>
            </div>
        </div>
    );
}
