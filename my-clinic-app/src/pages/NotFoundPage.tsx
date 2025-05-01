import React from 'react';
import { Link } from 'react-router-dom';

const NotFoundPage: React.FC = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <h1 className="text-4xl font-bold mb-4">404 - Страница не найдена</h1>
            <Link to="/" className="text-blue-600 hover:underline">
                Вернуться на главную
            </Link>
        </div>
    );
};

export default NotFoundPage;