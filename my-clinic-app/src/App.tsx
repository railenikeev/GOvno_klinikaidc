import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import NotFoundPage from './pages/NotFoundPage';
import ProtectedRoute from './components/ProtectedRoute';
import MakeAppointmentPage from './pages/MakeAppointmentPage';
import MyAppointmentsPage from './pages/MyAppointmentsPage';
import { useAuth } from './contexts/AuthContext';

function App() {
    const { token, isLoading } = useAuth(); // Получаем isLoading

    // Используем isLoading: пока true, показываем заглушку
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                Загрузка приложения...
            </div>
        );
    }

    return (
        <BrowserRouter>
            <Routes>
                {/* Публичные маршруты: редирект если уже вошел */}
                <Route path="/login" element={!token ? <LoginPage /> : <Navigate to="/" replace />} />
                <Route path="/register" element={!token ? <RegisterPage /> : <Navigate to="/" replace />} />

                {/* Защищенные маршруты */}
                <Route element={<ProtectedRoute />}>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/make-appointment" element={<MakeAppointmentPage />} />
                    <Route path="/my-appointments" element={<MyAppointmentsPage />} />
                    {/* Другие защищенные маршруты */}
                </Route>

                {/* Маршрут 404 */}
                <Route path="*" element={<NotFoundPage />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;