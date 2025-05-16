import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import apiClient from '@/services/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'; // Добавил CardDescription
import { Toaster, toast } from "sonner";
import {
    Briefcase,
    Users,
    CalendarDays,
    ListChecks,
    CreditCard,
    Bell,
    CalendarPlus,
    FileText,
    CalendarCheck
} from 'lucide-react'; // Добавил иконки

interface Appointment {
    id: number;
    patient_id?: number;
    patient_name?: string;
    doctor_id?: number;
    doctor_name?: string;
    specialization_name?: string;
    date?: string;
    start_time?: string;
    end_time?: string;
    status: string;
    created_at: string;
    doctor_schedule_id: number;
}

const DashboardPage: React.FC = () => {
    const { user } = useAuth(); // Убрал logout, так как он в Header
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

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
                return; // Для админа тут данные не грузятся, можно добавить, если нужно
            }

            try {
                const response = await apiClient.get<Appointment[]>(url);
                // Сортируем по дате и времени, новые вверху
                response.data.sort((a, b) => {
                    const dateA = a.date ?? '0000-00-00';
                    const dateB = b.date ?? '0000-00-00';
                    const dateComparison = dateB.localeCompare(dateA);
                    if (dateComparison !== 0) return dateComparison;
                    const timeA = a.start_time ?? '00:00';
                    const timeB = b.start_time ?? '00:00';
                    return timeA.localeCompare(timeB); // Более раннее время выше для той же даты
                });
                setAppointments(response.data.slice(0, 3)); // Показываем 3 ближайшие
            } catch (err) {
                console.error("Ошибка загрузки записей:", err);
                setError("Не удалось загрузить список записей.");
                toast.error("Не удалось загрузить список записей.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchAppointments().catch(err => {
            console.error("Error directly from fetchAppointments call:", err);
        });

    }, [user]);

    const renderRoleSpecificContent = () => {
        if (!user) {
            return <p className="text-center text-muted-foreground">Загрузка данных пользователя...</p>;
        }

        switch (user.role) {
            case 'patient':
                return (
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center">
                                    <CalendarCheck className="mr-2 h-5 w-5 text-primary" />
                                    Ваши ближайшие записи
                                </CardTitle>
                                <CardDescription>Просмотр предстоящих визитов к врачу.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isLoading && <p>Загрузка записей...</p>}
                                {error && <p className="text-red-500">{error}</p>}
                                {!isLoading && !error && appointments.length === 0 && (
                                    <p className="text-muted-foreground">У вас нет предстоящих записей.</p>
                                )}
                                {!isLoading && !error && appointments.length > 0 && (
                                    <ul className="space-y-3">
                                        {appointments.map((appointment) => (
                                            <li key={appointment.id} className="p-4 border rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors">
                                                <p className="font-semibold text-primary-foreground bg-primary px-2 py-0.5 rounded-full text-xs inline-block mb-1">{appointment.status}</p>
                                                <p className="font-medium">Врач: {appointment.doctor_name ?? 'N/A'} ({appointment.specialization_name ?? 'N/A'})</p>
                                                <p className="text-sm text-muted-foreground">Дата: {appointment.date ?? 'N/A'} Время: {appointment.start_time ? appointment.start_time.substring(0,5) : 'N/A'}</p>
                                            </li>
                                        ))}
                                        {appointments.length > 0 && ( // Показываем кнопку, если есть что смотреть
                                            <Button variant="link" asChild className="mt-2 px-0">
                                                <Link to="/my-appointments">Все мои записи →</Link>
                                            </Button>
                                        )}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            <Button size="lg" className="w-full justify-start text-left py-6" asChild>
                                <Link to="/make-appointment"><CalendarPlus className="mr-3 h-5 w-5" />Записаться на прием</Link>
                            </Button>
                            <Button variant="outline" size="lg" className="w-full justify-start text-left py-6" asChild>
                                <Link to="/my-records"><FileText className="mr-3 h-5 w-5" />Моя медкарта</Link>
                            </Button>
                            <Button variant="outline" size="lg" className="w-full justify-start text-left py-6" asChild>
                                <Link to="/my-payments"><CreditCard className="mr-3 h-5 w-5" />Мои платежи</Link>
                            </Button>
                        </div>
                    </div>
                );

            case 'doctor':
                return (
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center">
                                    <Users className="mr-2 h-5 w-5 text-primary" />
                                    Ваши ближайшие пациенты
                                </CardTitle>
                                <CardDescription>Обзор записей на ближайшее время.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isLoading && <p>Загрузка записей...</p>}
                                {error && <p className="text-red-500">{error}</p>}
                                {!isLoading && !error && appointments.length === 0 && <p className="text-muted-foreground">У вас нет предстоящих записей.</p>}
                                {!isLoading && !error && appointments.length > 0 && (
                                    <ul className="space-y-3">
                                        {appointments.map((appointment) => (
                                            <li key={appointment.id} className="p-4 border rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors flex justify-between items-center">
                                                <div>
                                                    <p className="font-semibold text-primary-foreground bg-primary px-2 py-0.5 rounded-full text-xs inline-block mb-1">{appointment.status}</p>
                                                    <p className="font-medium">Пациент: {appointment.patient_name ?? 'N/A'}</p>
                                                    <p className="text-sm text-muted-foreground">Дата: {appointment.date ?? 'N/A'} Время: {appointment.start_time ? appointment.start_time.substring(0,5) : 'N/A'}</p>
                                                </div>
                                                <Button size="sm" variant="outline" asChild>
                                                    <Link to={`/patient-record/${appointment.patient_id}`}>ЭМК</Link>
                                                </Button>
                                            </li>
                                        ))}
                                        {appointments.length > 0 && (
                                            <Button variant="link" asChild className="mt-2 px-0">
                                                <Link to="/view-appointments">Все мои записи →</Link>
                                            </Button>
                                        )}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Button size="lg" className="w-full justify-start text-left py-6" asChild>
                                <Link to="/manage-schedule"><CalendarPlus className="mr-3 h-5 w-5" />Управление расписанием</Link>
                            </Button>
                            <Button variant="outline" size="lg" className="w-full justify-start text-left py-6" asChild>
                                <Link to="/view-appointments"><ListChecks className="mr-3 h-5 w-5" />Все мои записи</Link>
                            </Button>
                        </div>
                    </div>
                );

            case 'admin':
                return (
                    <div>
                        <h2 className="text-2xl font-semibold mb-6 text-center">Панель Администратора</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[
                                { title: "Пользователи", link: "/admin/users", icon: Users, description: "Управление всеми пользователями системы." },
                                { title: "Специализации", link: "/admin/specializations", icon: Briefcase, description: "Добавление и редактирование специализаций." },
                                { title: "Расписания Врачей", link: "/admin/schedules", icon: CalendarDays, description: "Просмотр и управление слотами врачей." },
                                { title: "Все Записи", link: "/admin/appointments", icon: ListChecks, description: "Мониторинг и управление записями." },
                                { title: "Платежи", link: "/admin/payments", icon: CreditCard, description: "Просмотр всех транзакций.", comingSoon: true }, // Пример "скоро"
                                { title: "Уведомления", link: "/admin/notifications", icon: Bell, description: "Отправка и управление уведомлениями.", comingSoon: true },
                            ].map((item, index) => (
                                <Card key={index} className="hover:shadow-lg transition-shadow">
                                    <CardHeader>
                                        <CardTitle className="flex items-center">
                                            <item.icon className="mr-3 h-6 w-6 text-primary" />
                                            {item.title}
                                            {item.comingSoon && <span className="ml-2 text-xs bg-yellow-400 text-yellow-800 px-2 py-0.5 rounded-full">Скоро</span>}
                                        </CardTitle>
                                        <CardDescription>{item.description}</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <Button asChild className="w-full" disabled={item.comingSoon}>
                                            <Link to={item.link}>Перейти</Link>
                                        </Button>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                );
            default:
                return <p className="text-center text-muted-foreground">Неизвестная роль пользователя.</p>;
        }
    };

    // Главный div теперь не нужен, так как MainLayout уже предоставляет контейнер
    return (
        <>
            <Toaster position="top-center" richColors closeButton />
            <div className="mb-8 text-center"> {/* Заголовок страницы, если нужен */}
                <h1 className="text-3xl font-bold text-foreground">
                    {user?.role === 'admin' ? 'Администрирование' : `Клиника "Здоровье"`}
                </h1>
                <p className="text-muted-foreground">
                    Добро пожаловать, {user?.full_name || 'Гость'}! ({user?.role})
                </p>
            </div>
            {renderRoleSpecificContent()}
        </>
    );
};

export default DashboardPage;