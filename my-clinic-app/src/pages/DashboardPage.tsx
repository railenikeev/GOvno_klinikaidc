import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom'; // Для навигационных ссылок
import { useAuth } from '@/contexts/AuthContext';
import apiClient from '@/services/apiClient';
import { Button } from '@/components/ui/button';
// Убрали неиспользуемый импорт CardDescription
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Toaster, toast } from "sonner";

// Тип для записей (можно вынести в отдельный файл типов)
interface Appointment {
    id: number;
    patient_id?: number;
    patient_name?: string;
    doctor_id?: number;
    doctor_name?: string;
    specialization_name?: string;
    date?: string; // YYYY-MM-DD
    start_time?: string; // HH:MM
    end_time?: string; // HH:MM
    status: string;
    created_at: string; // или Date
    doctor_schedule_id: number;
}


const DashboardPage: React.FC = () => {
    const { user, logout } = useAuth();
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Загрузка данных при монтировании и при смене пользователя
    useEffect(() => {
        if (!user) return;

        const fetchAppointments = async () => {
            setIsLoading(true);
            setError(null);
            let url = '';
            if (user.role === 'patient') {
                url = '/appointments/my/patient';
            } else if (user.role === 'doctor') {
                url = '/appointments/my/doctor';
            } else {
                setIsLoading(false);
                return;
            }

            try {
                const response = await apiClient.get<Appointment[]>(url);
                setAppointments(response.data.slice(0, 5)); // Берем только 5
            } catch (err) {
                console.error("Ошибка загрузки записей:", err);
                setError("Не удалось загрузить список записей.");
                toast.error("Не удалось загрузить список записей.");
            } finally {
                setIsLoading(false);
            }
        };

        // Вызываем и обрабатываем Promise (чтобы линтер не ругался)
        fetchAppointments().catch(err => {
            console.error("Error directly from fetchAppointments call:", err);
        });

    }, [user]); // Зависимость от user

    // Функция для рендеринга контента в зависимости от роли
    const renderRoleSpecificContent = () => {
        if (!user) {
            return <p>Загрузка данных пользователя...</p>;
        }

        switch (user.role) {
            case 'patient':
                return (
                    <div>
                        <h2 className="text-xl font-semibold mb-3">Ваши ближайшие записи</h2>
                        {isLoading && <p>Загрузка записей...</p>}
                        {error && <p className="text-red-500">{error}</p>}
                        {!isLoading && !error && appointments.length === 0 && <p>У вас нет предстоящих записей.</p>}
                        {!isLoading && !error && appointments.length > 0 && (
                            <ul className="space-y-2 mb-4">
                                {/* Заменили appt на appointment */}
                                {appointments.map((appointment) => (
                                    <li key={appointment.id} className="p-2 border rounded">
                                        <p>Врач: {appointment.doctor_name ?? 'N/A'} ({appointment.specialization_name ?? 'N/A'})</p>
                                        <p>Дата: {appointment.date ?? 'N/A'} Время: {appointment.start_time ?? 'N/A'}</p>
                                        <p>Статус: {appointment.status}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="flex flex-wrap gap-2">
                            <Button asChild><Link to="/make-appointment">Записаться на прием</Link></Button>
                            <Button variant="outline" asChild><Link to="/my-records">Моя медкарта</Link></Button>
                            <Button variant="outline" asChild><Link to="/my-payments">Мои платежи</Link></Button>
                            <Button variant="outline" asChild><Link to="/notifications">Уведомления</Link></Button>
                        </div>
                    </div>
                );

            case 'doctor':
                return (
                    <div>
                        <h2 className="text-xl font-semibold mb-3">Ваши ближайшие пациенты</h2>
                        {isLoading && <p>Загрузка записей...</p>}
                        {error && <p className="text-red-500">{error}</p>}
                        {!isLoading && !error && appointments.length === 0 && <p>У вас нет предстоящих записей.</p>}
                        {!isLoading && !error && appointments.length > 0 && (
                            <ul className="space-y-2 mb-4">
                                {/* Заменили appt на appointment */}
                                {appointments.map((appointment) => (
                                    <li key={appointment.id} className="p-2 border rounded">
                                        <p>Пациент: {appointment.patient_name ?? 'N/A'}</p>
                                        <p>Дата: {appointment.date ?? 'N/A'} Время: {appointment.start_time ?? 'N/A'}</p>
                                        <p>Статус: {appointment.status}</p>
                                        <Button size="sm" variant="outline" asChild className="mt-1">
                                            <Link to={`/patient-record/${appointment.patient_id}`}>Открыть ЭМК</Link>
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="flex flex-wrap gap-2">
                            <Button asChild><Link to="/manage-schedule">Управление расписанием</Link></Button>
                            <Button variant="outline" asChild><Link to="/view-appointments">Все мои записи</Link></Button>
                        </div>
                    </div>
                );

            case 'admin':
                return (
                    <div>
                        <h2 className="text-xl font-semibold mb-3">Панель Администратора</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <Card>
                                <CardHeader><CardTitle>Пользователи</CardTitle></CardHeader>
                                <CardContent><Button asChild className="w-full"><Link to="/admin/users">Управление пользователями</Link></Button></CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>Врачи и Специализации</CardTitle></CardHeader>
                                <CardContent className="space-y-2">
                                    <Button asChild className="w-full"><Link to="/admin/doctors">Управление врачами</Link></Button>
                                    <Button asChild className="w-full" variant="outline"><Link to="/admin/specializations">Управление специализациями</Link></Button>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>Расписания</CardTitle></CardHeader>
                                <CardContent><Button asChild className="w-full"><Link to="/admin/schedules">Управление расписаниями</Link></Button></CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>Записи на прием</CardTitle></CardHeader>
                                <CardContent><Button asChild className="w-full"><Link to="/admin/appointments">Просмотр записей</Link></Button></CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>Платежи</CardTitle></CardHeader>
                                <CardContent><Button asChild className="w-full"><Link to="/admin/payments">Просмотр платежей</Link></Button></CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>Уведомления</CardTitle></CardHeader>
                                <CardContent><Button asChild className="w-full"><Link to="/admin/notifications">Управление уведомлениями</Link></Button></CardContent>
                            </Card>
                        </div>
                    </div>
                );

            default:
                return <p>Неизвестная роль пользователя.</p>;
        }
    };

    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Клиника "Здоровье"</h1> {/* Пример названия */}
                <div>
                    {user && (
                        <span className="mr-4 text-muted-foreground">
                        Пользователь: #{user.id} ({user.role})
                    </span>
                    )}
                    <Button onClick={logout} variant="outline">
                        Выйти
                    </Button>
                </div>
            </div>

            {renderRoleSpecificContent()}

        </div>
    );
};

export default DashboardPage;