// frontend/src/pages/LoginPage.jsx
// --------------------------------
import React, { useState } from 'react';
import { login } from '../../services/authService.js';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading]   = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (loading) return;
        setLoading(true);
        try {
            const user = await login(email, password); // ← authService уже сохранил token и id
            alert('Вход выполнен');

            // куда вести после логина?
            if (user.role === 'doctor') {
                navigate('/doctor');
            } else {
                navigate('/profile');
            }
        } catch (err) {
            alert('Ошибка входа: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-[calc(100vh-128px)] px-4 bg-gray-950 text-gray-200 font-mono">
            <form
                onSubmit={handleSubmit}
                className="bg-gray-900 border border-gray-800 shadow-xl rounded-xl p-8 w-full max-w-md"
            >
                <h2 className="text-2xl font-bold text-center text-purple-400 mb-6">
                    Вход в систему
                </h2>

                <div className="mb-4">
                    <label className="block text-sm mb-1 text-gray-400" htmlFor="email">
                        Email
                    </label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        required
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-100"
                    />
                </div>

                <div className="mb-6">
                    <label className="block text-sm mb-1 text-gray-400" htmlFor="password">
                        Пароль
                    </label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        required
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-100"
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className={`w-full font-semibold py-2 px-4 rounded transition shadow
            ${loading
                        ? 'bg-gray-700 cursor-not-allowed'
                        : 'bg-cyan-500 hover:bg-cyan-400 text-gray-900'}
          `}
                >
                    {loading ? '…' : 'Войти'}
                </button>
            </form>
        </div>
    );
}
