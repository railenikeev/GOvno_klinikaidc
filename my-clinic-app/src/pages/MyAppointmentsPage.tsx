// my-clinic-app/src/pages/MyAppointmentsPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO, isFuture } from 'date-fns'; // parseISO здесь нужен для даты, но не для времени HH:MM
import { ru } from 'date-fns/locale';
import axios from 'axios';

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Toaster, toast } from "sonner";

interface Appointment {
    id: number;
    patient_id?: number;
    doctor_id?: number;
    doctor_name?: string;
    specialization_name?: string;
    date?: string;
    start_time?: string; // Ожидается как "HH:MM"
    end_time?: string;   // Ожидается как "HH:MM"
    status: string;
    created_at: string;
    doctor_schedule_id: number;
}

const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status?.toLowerCase()) {
        case 'completed': return 'default';
        case 'scheduled': return 'secondary';
        case 'cancelled': return 'destructive';
        default: return 'outline';
    }
};

const MyAppointmentsPage: React.FC = () => {
    const { user, isLoading: authIsLoading } = useAuth(); // Добавил authIsLoading
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [cancellingId, setCancellingId] = useState<number | null>(null);

    const fetchAppointments = useCallback(async () => {
        if (!user || user.role !== 'patient') { // Проверка добавлена, чтобы избежать вызова если роль не та
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const response = await apiClient.get<Appointment[]>('/appointments/my/patient');
            // Сортируем записи: сначала более новые даты, затем более раннее время для одной даты
            response.data.sort((a, b) => {
                const dateA = a.date ? parseISO(a.date) : new Date(0);
                const dateB = b.date ? parseISO(b.date) : new Date(0);
                const dateComparison = dateB.getTime() - dateA.getTime();
                if (dateComparison !== 0) return dateComparison;

                const timeA = a.start_time ?? '00:00';
                const timeB = b.start_time ?? '00:00';
                return timeA.localeCompare(timeB); // Более раннее время выше
            });
            setAppointments(response.data || []);
        } catch (err) {
            console.error("Ошибка загрузки записей:", err);
            setError("Не удалось загрузить ваши записи.");
            toast.error("Не удалось загрузить ваши записи.");
            setAppointments([]);
        } finally {
            setIsLoading(false);
        }
    }, [user]); // Добавил user в зависимости

    useEffect(() => {
        if (authIsLoading) { // Если контекст аутентификации еще грузится
            setIsLoading(true); // Показываем общую загрузку страницы
            return;
        }

        if (user && user.role === 'patient') {
            fetchAppointments();
        } else if (!user) {
            setError("Пользователь не авторизован");
            setIsLoading(false);
            setAppointments([]); // Очищаем записи, если пользователя нет
        } else { // user.role !== 'patient'
            setError("Доступ запрещен для вашей роли");
            setIsLoading(false);
            setAppointments([]); // Очищаем записи
        }
    }, [user, authIsLoading, fetchAppointments]);


    const handleCancelAppointment = async (appointmentId: number) => {
        setCancellingId(appointmentId);
        let errorMessage = "Не удалось отменить запись.";
        try {
            const response = await apiClient.delete(`/appointments/${appointmentId}`);
            if (response.status === 204) {
                toast.success("Запись успешно отменена!");
                await fetchAppointments();
                setCancellingId(null); // Сбрасываем после успешного выполнения
                return;
            } else {
                console.warn("Неожиданный статус ответа при отмене записи:", response);
                errorMessage = `Неожиданный ответ сервера: ${response.status}`;
            }
        } catch (error) {
            console.error("Ошибка отмены записи:", error);
            if (axios.isAxiosError(error) && error.response) {
                errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            toast.error(errorMessage);
        } finally {
            // Убираем лоадер, только если это не был успешный выход из функции выше
            if (cancellingId === appointmentId) { // Проверяем, что это все еще та же операция
                setCancellingId(null);
            }
        }
    };

    // Главный лоадер рендерится до проверки роли
    if (authIsLoading || (isLoading && appointments.length === 0 && !error)) {
        return <div className="container mx-auto p-4 text-center">Загрузка записей...</div>;
    }

    if (error) {
        return (
            <div className="container mx-auto p-4">
                <Card>
                    <CardContent className="pt-6"> {/* Добавил padding-top для контента карточки ошибки */}
                        <p className="text-red-500 text-center">{error}</p>
                        <div className="mt-4 flex justify-center">
                            <Button variant="outline" asChild>
                                <Link to={user ? "/dashboard" : "/"}>На главную</Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Если пользователь не пациент (и загрузка AuthContext завершена)
    if (!authIsLoading && user && user.role !== 'patient') {
        return (
            <div className="container mx-auto p-4">
                <Card>
                    <CardContent className="pt-6 text-center">
                        <p className="text-red-500">Доступ к этой странице разрешен только пациентам.</p>
                        <div className="mt-4 flex justify-center">
                            <Button variant="outline" asChild>
                                <Link to="/dashboard">К панели управления</Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }


    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <h1 className="text-2xl font-bold mb-6">Мои записи</h1>

            {appointments.length === 0 ? (
                <Card> {/* Обернул сообщение в Card для единообразия */}
                    <CardContent className="pt-6 text-center">
                        <p>У вас пока нет записей на прием.</p>
                        <div className="mt-4">
                            <Button asChild>
                                <Link to="/make-appointment">Записаться на прием</Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Дата</TableHead>
                                    <TableHead>Время</TableHead>
                                    <TableHead>Врач</TableHead>
                                    <TableHead>Специализация</TableHead>
                                    <TableHead>Статус</TableHead>
                                    <TableHead className="text-right">Действия</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {appointments.map((appointment) => {
                                    const canCancel = appointment.status === 'scheduled' && appointment.date && isFuture(parseISO(appointment.date));
                                    const isCancellingCurrent = cancellingId === appointment.id;

                                    return (
                                        <TableRow key={appointment.id}>
                                            <TableCell>{appointment.date ? format(parseISO(appointment.date), 'dd.MM.yyyy', { locale: ru }) : 'N/A'}</TableCell>
                                            {/* ИСПРАВЛЕНИЕ ЗДЕСЬ: Отображаем start_time напрямую */}
                                            <TableCell>{appointment.start_time ?? 'N/A'}</TableCell>
                                            <TableCell>{appointment.doctor_name ?? 'N/A'}</TableCell>
                                            <TableCell>{appointment.specialization_name ?? 'N/A'}</TableCell>
                                            <TableCell>
                                                <Badge variant={getStatusVariant(appointment.status)}>{appointment.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {canCancel ? (
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="destructive" size="sm" disabled={isCancellingCurrent}>
                                                                {isCancellingCurrent ? 'Отмена...' : 'Отменить'}
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Отменить запись?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Вы уверены, что хотите отменить запись к врачу
                                                                    <span className="font-semibold"> {appointment.doctor_name}</span> на
                                                                    <span className="font-semibold"> {appointment.date ? format(parseISO(appointment.date), 'dd.MM.yyyy', { locale: ru }) : ''} в {appointment.start_time}</span>?
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel disabled={isCancellingCurrent}>Нет</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleCancelAppointment(appointment.id)} disabled={isCancellingCurrent}>
                                                                    Да, отменить
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
            <Button variant="outline" asChild className="mt-6">
                <Link to="/">Назад к панели</Link>
            </Button>
        </div>
    );
};

export default MyAppointmentsPage;