import React, { useState } from 'react';
import { register } from '../../services/authService.js';
import { useNavigate } from 'react-router-dom';

export default function RegisterPage() {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            alert('Пароли не совпадают');
            return;
        }

        try {
            await register({ fullName, email, password, phone });
            alert('Регистрация прошла успешно!');
            navigate('/login');
        } catch (err) {
            alert('Ошибка регистрации: ' + err.message);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-[calc(100vh-128px)] px-4 bg-gray-950 text-gray-200 font-mono">
            <form
                onSubmit={handleSubmit}
                className="bg-gray-900 border border-gray-800 shadow-xl rounded-xl p-8 w-full max-w-md"
            >
                <h2 className="text-2xl font-bold text-center text-purple-400 mb-6">
                    Регистрация
                </h2>

                {/* ФИО */}
                <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-1">ФИО</label>
                    <input
                        type="text"
                        value={fullName}
                        required
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-100"
                    />
                </div>

                {/* Email */}
                <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-1">Email</label>
                    <input
                        type="email"
                        value={email}
                        required
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-100"
                    />
                </div>

                {/* Телефон */}
                <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-1">Телефон</label>
                    <input
                        type="tel"
                        value={phone}
                        required
                        pattern="[0-9]{10}"
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-100"
                    />
                </div>

                {/* Пароль */}
                <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-1">Пароль</label>
                    <input
                        type="password"
                        value={password}
                        required
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-100"
                    />
                </div>

                {/* Подтверждение пароля */}
                <div className="mb-6">
                    <label className="block text-sm text-gray-400 mb-1">Повторите пароль</label>
                    <input
                        type="password"
                        value={confirmPassword}
                        required
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-100"
                    />
                </div>

                <button
                    type="submit"
                    className="w-full bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-semibold py-2 px-4 rounded transition shadow"
                >
                    Зарегистрироваться
                </button>
            </form>
        </div>
    );
}
