import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import apiClient from '@/services/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Toaster, toast } from "sonner";
import { Users, CalendarDays, CreditCard, CalendarPlus, FileText } from 'lucide-react';

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
    const { user } = useAuth();
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        const fetchAppointments = async () => {
            setIsLoading(true);
            setError(null);
            let url = '';
            if (user.role === 'patient' || user.role === 'doctor') {
                url = user.role === 'patient' ? '/appointments/my/patient' : '/appointments/my/doctor';
            } else {
                setIsLoading(false);
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
                    return timeA.localeCompare(timeB);
                });
                setAppointments(response.data.slice(0, 3));
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

        // ИЗМЕНЕНИЕ ЗДЕСЬ: Убираем max-w и mx-auto для всех ролей,
        // чтобы контент занимал всю ширину родителя
        const roleContentWrapperClass = "w-full space-y-8"; // Общий класс для всех, можно добавить padding если нужно (py-6 и т.п.)

        return (
            <div className={roleContentWrapperClass}>
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
                                                            <p className={`font-semibold text-primary-foreground ${appointment.status === 'completed' ? 'bg-green-600' : 'bg-primary'} px-2 py-0.5 rounded-full text-xs inline-block mb-1`}>{appointment.status}</p>
                                                            <p className="font-medium">Врач: {appointment.doctor_name ?? 'N/A'} ({appointment.specialization_name ?? 'N/A'})</p>
                                                            <p className="text-sm text-muted-foreground">Дата: {appointment.date ?? 'N/A'} Время: {appointment.start_time ? appointment.start_time.substring(0,5) : 'N/A'}</p>
                                                        </li>
                                                    ))}
                                                    {appointments.length > 0 && (
                                                        <Button variant="link" asChild className="mt-3 px-0 text-sm">
                                                            <Link to="/my-appointments">Все мои записи →</Link>
                                                        </Button>
                                                    )}
                                                </ul>
                                            )}
                                        </CardContent>
                                    </Card>
                                    {/* Для кнопок можно оставить grid, он адаптируется */}
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
                                            {/* ... контент для доктора ... */}
                                        </CardContent>
                                    </Card>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {/* ... кнопки для доктора ... */}
                                    </div>
                                </>
                            );

                        case 'admin':
                            return (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                        {/* ... карточки администратора ... */}
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
                    {user?.role === 'admin' ? 'Администрирование' : `Клиника "Здоровье"`}
                </h1>
                <p className="text-muted-foreground">
                    Добро пожаловать, {user?.full_name || 'Гость'}! ({user?.role})
                </p>
            </div>
            <div className="flex-grow flex flex-col">
                {renderRoleSpecificContent()}
            </div>
        </div>
    );
};

export default DashboardPage;