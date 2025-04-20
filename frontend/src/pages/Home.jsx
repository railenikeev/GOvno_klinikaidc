import React from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
    return (
        <main className="min-h-[calc(100vh-128px)] bg-gray-950 text-gray-300 flex items-center justify-center px-4 py-12 font-mono">
            <div className="bg-gray-900 shadow-2xl rounded-xl p-10 max-w-2xl w-full text-center border border-gray-800">
                <h1 className="text-4xl md:text-5xl font-bold text-purple-400 mb-4">
                    Онлайн-запись👨‍⚕️
                </h1>
                <p className="text-gray-400 text-md mb-6 leading-relaxed">
                    Быстрая запись к врачу без звонков и очередей.
                </p>
                <Link
                    to="/booking"
                    className="inline-block border border-cyan-500 hover:bg-cyan-500 hover:text-gray-900 text-cyan-400 text-sm font-semibold py-2.5 px-6 rounded-lg transition duration-200"
                >
                    Записаться →
                </Link>
            </div>
        </main>
    );
}
