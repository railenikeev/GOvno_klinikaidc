import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import apiClient from '@/services/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Toaster, toast } from "sonner";
import { Briefcase, Users, CalendarDays, ListChecks, CreditCard, Bell, CalendarPlus, FileText } from 'lucide-react'; // Добавил Briefcase, Bell

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

const statusTranslations: { [key: string]: string } = {
    completed: 'Завершена',
    scheduled: 'Запланирована',
    cancelled: 'Отменена',
};

const DashboardPage: React.FC = () => {
    const { user } = useAuth(); // Убираем logout, он должен быть в Header.tsx
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        const fetchAppointments = async () => {
            setIsLoading(true);
            setError(null);
            let url = '';
            // Загружаем записи для пациента и доктора
            if (user.role === 'patient' || user.role === 'doctor') {
                url = user.role === 'patient' ? '/appointments/my/patient' : '/appointments/my/doctor';
            } else {
                setIsLoading(false); // Для админа или других ролей здесь данные не грузим
                return;
            }

            try {
                const response = await apiClient.get<Appointment[]>(url);
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
            return <div className="flex-1 flex items-center justify-center text-muted-foreground"><p>Загрузка данных пользователя...</p></div>;
        }

        // Оставляем общую обертку с w-full и space-y-8,
        // а для пациента/доктора можно добавить max-w- и mx-auto при необходимости
        const roleSpecificWrapperClass = user.role === 'patient' || user.role === 'doctor'
            ? "w-full max-w-5xl mx-auto space-y-8" // Для пациента и доктора контент центрирован и ограничен по ширине
            : "w-full space-y-6"; // Для админа - на всю ширину контейнера

        return (
            <div className={roleSpecificWrapperClass}>
                {(() => {
                    switch (user.role) {
                        case 'patient':
                            return (
                                <>
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="flex items-center">
                                                <CalendarDays className="mr-2 h-5 w-5 text-primary" />
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
                                                        <li key={appointment.id} className="p-4 border rounded-lg bg-card hover:bg-muted/60 transition-colors">
                                                            <p className={`font-semibold text-primary-foreground ${appointment.status === 'completed' ? 'bg-green-600' : appointment.status === 'cancelled' ? 'bg-red-600' : 'bg-primary'} px-2 py-0.5 rounded-full text-xs inline-block mb-1`}>
                                                                {statusTranslations[appointment.status.toLowerCase()] || appointment.status}
                                                            </p>
                                                            <p className="font-medium">Врач: {appointment.doctor_name ?? 'N/A'} ({appointment.specialization_name ?? 'N/A'})</p>
                                                            <p className="text-sm text-muted-foreground">Дата: {appointment.date ?? 'N/A'} Время: {appointment.start_time ? appointment.start_time.substring(0,5) : 'N/A'}</p>
                                                        </li>
                                                    ))}
                                                    {appointments.length > 0 && ( // Показываем кнопку, если есть что смотреть
                                                        <Button variant="link" asChild className="mt-3 px-0 text-sm">
                                                            <Link to="/my-appointments">Все мои записи →</Link>
                                                        </Button>
                                                    )}
                                                </ul>
                                            )}
                                        </CardContent>
                                    </Card>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                        <Button size="lg" className="w-full justify-start text-left h-auto py-4" asChild>
                                            <Link to="/make-appointment"><CalendarPlus className="mr-3 h-5 w-5 flex-shrink-0" />Записаться на прием</Link>
                                        </Button>
                                        <Button variant="outline" size="lg" className="w-full justify-start text-left h-auto py-4" asChild>
                                            <Link to="/my-records"><FileText className="mr-3 h-5 w-5 flex-shrink-0" />Моя медкарта</Link>
                                        </Button>
                                        <Button variant="outline" size="lg" className="w-full justify-start text-left h-auto py-4" asChild>
                                            <Link to="/my-payments"><CreditCard className="mr-3 h-5 w-5 flex-shrink-0" />Мои платежи</Link>
                                        </Button>
                                        {/* Уведомления доступны из хедера, здесь можно убрать, если не нужно дублировать */}
                                    </div>
                                </>
                            );

                        case 'doctor':
                            return (
                                <>
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
                                                        <li key={appointment.id} className="p-4 border rounded-lg bg-card hover:bg-muted/60 transition-colors flex flex-col sm:flex-row justify-between sm:items-center">
                                                            <div className="mb-2 sm:mb-0">
                                                                <p className={`font-semibold text-primary-foreground ${appointment.status === 'completed' ? 'bg-green-600' : appointment.status === 'cancelled' ? 'bg-red-600' : 'bg-primary'} px-2 py-0.5 rounded-full text-xs inline-block mb-1`}>
                                                                    {statusTranslations[appointment.status.toLowerCase()] || appointment.status}
                                                                </p>
                                                                <p className="font-medium">Пациент: {appointment.patient_name ?? 'N/A'}</p>
                                                                <p className="text-sm text-muted-foreground">Дата: {appointment.date ?? 'N/A'} Время: {appointment.start_time ? appointment.start_time.substring(0,5) : 'N/A'}</p>
                                                            </div>
                                                            <Button size="sm" variant="outline" asChild className="w-full sm:w-auto">
                                                                <Link to={`/patient-record/${appointment.patient_id}`}>Открыть ЭМК</Link>
                                                            </Button>
                                                        </li>
                                                    ))}
                                                    {appointments.length > 0 && (
                                                        <Button variant="link" asChild className="mt-3 px-0 text-sm">
                                                            <Link to="/view-appointments">Все мои записи →</Link>
                                                        </Button>
                                                    )}
                                                </ul>
                                            )}
                                        </CardContent>
                                    </Card>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <Button size="lg" className="w-full justify-start text-left h-auto py-4" asChild>
                                            <Link to="/manage-schedule"><CalendarPlus className="mr-3 h-5 w-5 flex-shrink-0" />Управление расписанием</Link>
                                        </Button>
                                        <Button variant="outline" size="lg" className="w-full justify-start text-left h-auto py-4" asChild>
                                            <Link to="/view-appointments"><ListChecks className="mr-3 h-5 w-5 flex-shrink-0" />Все мои записи</Link>
                                        </Button>
                                    </div>
                                </>
                            );

                        case 'admin':
                            // Используем структуру из предыдущего варианта с карточками
                            return (
                                <>
                                    {/* Заголовок для админ панели можно убрать отсюда, если он уже есть выше */}
                                    {/* <h2 className="text-2xl font-semibold mb-6 text-center">Панель Администратора</h2> */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6"> {/* Изменил на xl:grid-cols-3 для лучшего вида */}
                                        {[
                                            { title: "Пользователи", link: "/admin/users", icon: Users, description: "Управление всеми пользователями системы." },
                                            { title: "Специализации", link: "/admin/specializations", icon: Briefcase, description: "Добавление и редактирование специализаций." },
                                            { title: "Расписания Врачей", link: "/admin/schedules", icon: CalendarDays, description: "Просмотр и управление слотами врачей." },
                                            { title: "Все Записи", link: "/admin/appointments", icon: ListChecks, description: "Мониторинг и управление записями." },
                                            { title: "Платежи", link: "/admin/payments", icon: CreditCard, description: "Просмотр всех транзакций.", comingSoon: false }, // Убрал comingSoon для примера
                                            { title: "Уведомления", link: "/admin/notifications", icon: Bell, description: "Отправка и управление уведомлениями.", comingSoon: true },
                                        ].map((item, index) => (
                                            <Card key={index} className="flex flex-col hover:shadow-lg transition-shadow">
                                                <CardHeader className="pb-4">
                                                    <CardTitle className="flex items-start text-lg"> {/* Уменьшил размер заголовка карточки */}
                                                        <item.icon className="mr-3 h-5 w-5 text-primary flex-shrink-0 mt-0.5" /> {/* Скорректировал иконку */}
                                                        <span className="flex-1">{item.title}</span>
                                                        {item.comingSoon && <span className="ml-2 text-xs bg-yellow-400 text-yellow-800 px-2 py-0.5 rounded-full self-start">Скоро</span>}
                                                    </CardTitle>
                                                    <CardDescription className="text-xs pt-1">{item.description}</CardDescription>
                                                </CardHeader>
                                                <CardContent className="flex-grow flex flex-col justify-end pt-0"> {/* Убрал верхний padding */}
                                                    <Button asChild className="w-full" disabled={item.comingSoon}>
                                                        <Link to={item.link}>Перейти</Link>
                                                    </Button>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </>
                            );
                        default:
                            return <div className="flex-1 flex items-center justify-center text-muted-foreground"><p>Неизвестная роль пользователя.</p></div>;
                    }
                })()}
            </div>
        );
    };

    return (
        <div className="w-full flex flex-col flex-grow">
            <Toaster position="top-center" richColors closeButton />
            <div className="mb-8 text-left">
                <h1 className="text-3xl font-bold text-foreground">
                    {user?.role === 'admin' ? 'Панель Управления' : ``}
                </h1>
            </div>
            <div className="flex-grow flex flex-col">
                {renderRoleSpecificContent()}
            </div>
        </div>
    );
};

export default DashboardPage;