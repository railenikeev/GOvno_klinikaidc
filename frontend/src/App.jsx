// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Header from './components/Header';
import Footer from './components/Footer';

import Home from './pages/Home';
import LoginPage from './features/auth/LoginPage';
import RegisterPage from './features/auth/RegisterPage';
import BookingWizard from './features/booking/BookingWizard'

import AppointmentsPage from './pages/AppointmentsPage';
import AppointmentDetails from './pages/AppointmentDetails';
import DoctorDashboard from './pages/DoctorDashboard';
import AdminDashboard from './pages/AdminDashboard';
import SystemAdminDashboard from './pages/SystemAdminDashboard';
import NotFound from './pages/NotFound';
import ProfilePage from "./pages/ProfilePage.jsx";

export default function App() {
    return (
        <Router>
            <div className="flex flex-col min-h-screen bg-gray-950 text-white">
                <Header />

                <main className="flex-grow">
                    <Routes>
                        {/* Public */}
                        <Route path="/" element={<Home />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />
                        <Route path="/booking" element={<BookingWizard />} />

                        {/* Patient */}
                        <Route path="/appointments" element={<AppointmentsPage />} />
                        <Route path="/appointments/:id" element={<AppointmentDetails />} />

                        <Route path="/profile" element={<ProfilePage />} />

                        {/* Doctor */}
                        <Route path="/doctor" element={<DoctorDashboard />} />

                        {/* Clinic Admin */}
                        <Route path="/admin" element={<AdminDashboard />} />

                        {/* System Admin */}
                        <Route path="/system-admin" element={<SystemAdminDashboard />} />

                        {/* 404 */}
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </main>

                <Footer />
            </div>
        </Router>
    );
}
