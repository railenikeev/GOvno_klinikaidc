import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import NotFoundPage from './pages/NotFoundPage';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/MainLayout';
import { useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';

import MakeAppointmentPage from './pages/MakeAppointmentPage';
import MyAppointmentsPage from './pages/MyAppointmentsPage';
import MyMedicalRecordsPage from './pages/MyMedicalRecordsPage';
import MyPaymentsPage from './pages/MyPaymentsPage';
import NotificationsPage from './pages/NotificationsPage';
import ProfilePage from './pages/ProfilePage';

import ManageSchedulePage from './pages/doctor/ManageSchedulePage';
import ViewAppointmentsPage from './pages/doctor/ViewAppointmentsPage';
import PatientRecordPage from './pages/doctor/PatientRecordPage';

import ManageSpecializationsPage from './pages/admin/ManageSpecializationsPage';
import ManageUsersPage from './pages/admin/ManageUsersPage';
import ManageAllSchedulesPage from './pages/admin/ManageAllSchedulesPage';
import ViewAllAppointmentsPage from './pages/admin/ViewAllAppointmentsPage';

const AppWithLayout = () => {
    return (
        <MainLayout>
            <Outlet />
        </MainLayout>
    );
};

function App() {
    const { token, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
                Загрузка приложения...
            </div>
        );
    }

    return (
        <BrowserRouter>
            <Routes>
                <Route
                    path="/"
                    element={!token ? <LandingPage /> : <Navigate to="/dashboard" replace />}
                />

                <Route
                    path="/login"
                    element={!token ? <LoginPage /> : <Navigate to="/dashboard" replace />}
                />
                <Route
                    path="/register"
                    element={!token ? <RegisterPage /> : <Navigate to="/dashboard" replace />}
                />

                <Route element={<ProtectedRoute />}>
                    <Route element={<AppWithLayout />}>
                        <Route path="/dashboard" element={<DashboardPage />} />
                        <Route path="/make-appointment" element={<MakeAppointmentPage />} />
                        <Route path="/my-appointments" element={<MyAppointmentsPage />} />
                        <Route path="/my-records" element={<MyMedicalRecordsPage />} />
                        <Route path="/my-payments" element={<MyPaymentsPage />} />
                        <Route path="/notifications" element={<NotificationsPage />} />
                        <Route path="/profile" element={<ProfilePage />} />

                        <Route path="/manage-schedule" element={<ManageSchedulePage />} />
                        <Route path="/view-appointments" element={<ViewAppointmentsPage />} />
                        <Route path="/patient-record/:patientId" element={<PatientRecordPage />} />

                        <Route path="/admin/specializations" element={<ManageSpecializationsPage />} />
                        <Route path="/admin/users" element={<ManageUsersPage />} />
                        <Route path="/admin/schedules" element={<ManageAllSchedulesPage />} />
                        <Route path="/admin/appointments" element={<ViewAllAppointmentsPage />} />
                    </Route>
                </Route>

                <Route path="*" element={<NotFoundPage />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;