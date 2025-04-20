// src/pages/ProfilePage.jsx
import { useEffect, useState } from 'react';
import { getProfile, updateProfile, changePassword } from '../services/profileService';

export default function ProfilePage() {
    const [user, setUser] = useState(null);
    const [form, setForm] = useState({ full_name: '', email: '' });
    const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
    const [message, setMessage] = useState('');

    useEffect(() => {
        async function load() {
            try {
                const data = await getProfile();
                setUser(data);
                setForm({ full_name: data.full_name, email: data.email });
            } catch (e) {
                setMessage(e.message);
            }
        }
        load();
    }, []);

    const onChangeForm = e => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const onSaveProfile = async e => {
        e.preventDefault();
        try {
            await updateProfile(form);
            setMessage('Профиль обновлён');
        } catch (e) {
            setMessage(e.message);
        }
    };

    const onChangePass = async e => {
        e.preventDefault();
        if (passwords.new !== passwords.confirm) {
            setMessage('Пароли не совпадают');
            return;
        }
        try {
            await changePassword(passwords);
            setMessage('Пароль изменён');
            setPasswords({ current: '', new: '', confirm: '' });
        } catch (e) {
            setMessage(e.message);
        }
    };

    if (!user) return <div className="text-center pt-20 text-gray-400">Загрузка...</div>;

    return (
        <div className="max-w-2xl mx-auto mt-12 px-4">
            <h1 className="text-2xl font-semibold text-white mb-6">Профиль пользователя</h1>

            {message && (
                <div className="mb-4 p-3 bg-red-600 text-white rounded">
                    {message}
                </div>
            )}

            {/* Карточка с базовой информацией */}
            <div className="bg-gray-800 p-6 rounded-lg shadow mb-8">
                <p><span className="font-medium text-gray-400">ID:</span> <span className="text-white">{user.id}</span></p>
                <p><span className="font-medium text-gray-400">Роль:</span> <span className="text-white">{user.role}</span></p>
                <p><span className="font-medium text-gray-400">Телефон:</span> <span className="text-white">{user.phone}</span></p>
            </div>

            {/* Форма редактирования профиля */}
            <form onSubmit={onSaveProfile} className="bg-gray-800 p-6 rounded-lg shadow mb-8">
                <h2 className="text-xl font-medium text-white mb-4">Редактировать данные</h2>

                <label className="block text-gray-400 mb-1">ФИО</label>
                <input
                    type="text"
                    name="full_name"
                    value={form.full_name}
                    onChange={onChangeForm}
                    className="w-full mb-4 px-3 py-2 rounded bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />

                <label className="block text-gray-400 mb-1">Email</label>
                <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={onChangeForm}
                    className="w-full mb-6 px-3 py-2 rounded bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />

                <button
                    type="submit"
                    className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 px-4 rounded transition"
                >
                    Сохранить профиль
                </button>
            </form>

            {/* Форма смены пароля */}
            <form onSubmit={onChangePass} className="bg-gray-800 p-6 rounded-lg shadow">
                <h2 className="text-xl font-medium text-white mb-4">Сменить пароль</h2>

                <label className="block text-gray-400 mb-1">Текущий пароль</label>
                <input
                    type="password"
                    name="current"
                    value={passwords.current}
                    onChange={e => setPasswords(prev => ({ ...prev, current: e.target.value }))}
                    className="w-full mb-4 px-3 py-2 rounded bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />

                <label className="block text-gray-400 mb-1">Новый пароль</label>
                <input
                    type="password"
                    name="new"
                    value={passwords.new}
                    onChange={e => setPasswords(prev => ({ ...prev, new: e.target.value }))}
                    className="w-full mb-4 px-3 py-2 rounded bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />

                <label className="block text-gray-400 mb-1">Подтвердите новый пароль</label>
                <input
                    type="password"
                    name="confirm"
                    value={passwords.confirm}
                    onChange={e => setPasswords(prev => ({ ...prev, confirm: e.target.value }))}
                    className="w-full mb-6 px-3 py-2 rounded bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />

                <button
                    type="submit"
                    className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 px-4 rounded transition"
                >
                    Изменить пароль
                </button>
            </form>
        </div>
    );
}
