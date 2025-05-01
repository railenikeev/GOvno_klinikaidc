import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
    allowedRoles?: string[]; // Опциональный массив ролей, которым разрешен доступ
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
    const { user, token, isLoading } = useAuth();

    if (isLoading) {
        // Показываем заглушку, пока идет проверка токена
        return <div>Загрузка...</div>;
    }

    if (!token || !user) {
        // Если токена нет или пользователя нет (и загрузка завершена), редирект на логин
        return <Navigate to="/login" replace />;
    }

    // Проверка роли (если список разрешенных ролей передан)
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        // Роль пользователя не входит в список разрешенных - можно показать страницу "Доступ запрещен" или редиректить
        console.warn(`Forbidden access attempt by role ${user.role} to route requiring ${allowedRoles}`);
        // Например, редирект на главную или показать сообщение
        return <Navigate to="/" replace />; // Или <Navigate to="/unauthorized" replace />;
    }


    // Если все проверки пройдены, показываем дочерний компонент (страницу)
    return <Outlet />; // Outlet рендерит вложенный Route
};

export default ProtectedRoute;