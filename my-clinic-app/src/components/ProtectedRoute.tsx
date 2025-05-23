import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
    allowedRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
    const { user, token, isLoading } = useAuth();

    if (isLoading) {
        return <div>Загрузка...</div>;
    }

    if (!token || !user) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        console.warn(`Forbidden access attempt by role ${user.role} to route requiring ${allowedRoles}`);
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;