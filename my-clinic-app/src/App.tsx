import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import NotFoundPage from './pages/NotFoundPage';
import ProtectedRoute from './components/ProtectedRoute';
import MakeAppointmentPage from './pages/MakeAppointmentPage';
import MyAppointmentsPage from './pages/MyAppointmentsPage';
import MyMedicalRecordsPage from './pages/MyMedicalRecordsPage';
import MyPaymentsPage from './pages/MyPaymentsPage';
import NotificationsPage from './pages/NotificationsPage';
import ManageSchedulePage from './pages/doctor/ManageSchedulePage';
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
                    <Route path="/my-records" element={<MyMedicalRecordsPage />} />
                    <Route path="/my-payments" element={<MyPaymentsPage />} />
                    <Route path="/notifications" element={<NotificationsPage />} />
                    {/* Другие защищенные маршруты */}
                </Route>

                <Route element={<ProtectedRoute allowedRoles={['doctor']} />}> {/* <-- Защита по роли */}
                    <Route path="/manage-schedule" element={<ManageSchedulePage />} />
                    {/* <Route path="/view-appointments" element={<DoctorAppointmentsPage />} /> */}
                    {/* <Route path="/patient-record/:patientId" element={<DoctorPatientRecordPage />} /> */}
                </Route>

                <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                    <Route path="/admin/users" element={<AdminUsersPage />} />
                </Route>

                {/* Маршрут 404 */}
                <Route path="*" element={<NotFoundPage />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;