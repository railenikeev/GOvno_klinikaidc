import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
    return (
        <div className="min-h-[calc(100vh-128px)] bg-gray-950 text-gray-300 font-mono flex items-center justify-center px-4 py-16 text-center">
            <div>
                <h1 className="text-6xl font-bold text-gray-700 mb-4">404</h1>
                <p className="text-gray-400 mb-6">Такой страницы не существует.</p>
                <Link
                    to="/"
                    className="inline-block border border-purple-500 text-purple-400 hover:bg-purple-500 hover:text-gray-950 transition rounded px-5 py-2 text-sm"
                >
                    Вернуться на главную
                </Link>
            </div>
        </div>
    );
}
