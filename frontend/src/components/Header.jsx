import React from 'react';
import {Link, useLocation} from 'react-router-dom';
import {
    HomeIcon,
    CalendarIcon,
    ArrowRightOnRectangleIcon,
    UserPlusIcon,
    ClipboardDocumentListIcon
} from '@heroicons/react/24/outline';

export default function Header() {
    const {pathname} = useLocation();

    const linkClass = path =>
        `inline-flex items-center space-x-1 text-sm md:text-base transition ${
            pathname === path ? 'text-purple-400' : 'text-gray-400 hover:text-purple-400'
        }`;

    return (
        <header className="bg-gray-950 text-gray-300 shadow-lg sticky top-0 z-50 font-mono">
            <div className="container mx-auto px-4 py-4 flex justify-between items-center">
                <Link to="/" className="text-xl font-bold text-purple-400">
                    Онлайн‑запись
                </Link>

                <nav className="space-x-6">
                    <Link to="/" className={linkClass('/')}>
                        <HomeIcon className="h-5 w-5"/>
                        <span>Главная</span>
                    </Link>

                    <Link to="/booking" className={linkClass('/booking')}>
                        <CalendarIcon className="h-5 w-5"/>
                        <span>Запись</span>
                    </Link>

                    <Link to="/appointments" className={linkClass('/appointments')}>
                        <ClipboardDocumentListIcon className="h-5 w-5"/>
                        <span>Мои записи</span>
                    </Link>

                    <Link to="/login" className={linkClass('/login')}>
                        <ArrowRightOnRectangleIcon className="h-5 w-5"/>
                        <span>Вход</span>
                    </Link>

                    <Link to="/register" className={linkClass('/register')}>
                        <UserPlusIcon className="h-5 w-5"/>
                        <span>Регистрация</span>
                    </Link>

                    <Link to="/profile" className={linkClass('/profile')}>Профиль</Link>

                    <Link to="/admin" className={linkClass('/admin')}>
                        Админ
                    </Link>

                </nav>
            </div>
        </header>
    );
}
