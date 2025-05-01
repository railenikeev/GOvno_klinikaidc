import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO, isFuture } from 'date-fns';
import { ru } from 'date-fns/locale';
import axios from 'axios'; // Оставили для isAxiosError

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card'; // Убрали CardHeader, CardTitle
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"; // Убрали TableCaption
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Toaster, toast } from "sonner";

// Тип для записей (из ответа GET /appointments/my/patient)
interface Appointment {
    id: number;
    patient_id?: number;
    doctor_id?: number;
    doctor_name?: string;
    specialization_name?: string;
    date?: string; // Формат YYYY-MM-DD
    start_time?: string; // Формат HH:MM
    end_time?: string; // Формат HH:MM
    status: string;
    created_at: string;
    doctor_schedule_id: number;
}

// Функция для определения варианта Badge по статусу
const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status?.toLowerCase()) {
        case 'completed': return 'default';
        case 'scheduled': return 'secondary';
        case 'cancelled': return 'destructive';
        default: return 'outline';
    }
};


const MyAppointmentsPage: React.FC = () => {
    const { user } = useAuth();
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [cancellingId, setCancellingId] = useState<number | null>(null); // ID записи, которую отменяем

    // Функция загрузки записей
    const fetchAppointments = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await apiClient.get<Appointment[]>('/appointments/my/patient');
            setAppointments(response.data);
        } catch (err) {
            console.error("Ошибка загрузки записей:", err);
            setError("Не удалось загрузить ваши записи.");
            toast.error("Не удалось загрузить ваши записи.");
        } finally {
            setIsLoading(false);
        }
    }, []); // useCallback

    useEffect(() => {
        if (user && user.role === 'patient') {
            fetchAppointments().catch(console.error);
        } else if(!user) {
            setError("Пользователь не авторизован");
            setIsLoading(false);
        } else {
            setError("Доступ запрещен для вашей роли");
            setIsLoading(false);
        }
    }, [user, fetchAppointments]);

    // Функция отмены записи (теперь с реальным API вызовом)
    const handleCancelAppointment = async (appointmentId: number) => {
        setCancellingId(appointmentId);
        let errorMessage = "Не удалось отменить запись."; // Сообщение по умолчанию

        try {
            // --- Вызов API для отмены/удаления ---
            const response = await apiClient.delete(`/appointments/${appointmentId}`);
            // Ожидаем статус 204 No Content при успехе

            if (response.status === 204) {
                toast.success("Запись успешно отменена!");
                await fetchAppointments(); // Обновляем список записей после успешной отмены
                // Выходим, чтобы не показать ошибку
                setCancellingId(null);
                return;
            } else {
                // Неожиданный успешный статус (не 204)
                console.warn("Неожиданный статус ответа при отмене записи:", response);
                errorMessage = `Неожиданный ответ сервера: ${response.status}`;
            }

        } catch (error) {
            console.error("Ошибка отмены записи:", error);
            if (axios.isAxiosError(error) && error.response) {
                // Обрабатываем ошибки от бэкенда (403, 404, 409, 500...)
                errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            // Показываем ошибку
            toast.error(errorMessage);
        } finally {
            setCancellingId(null); // Убираем лоадер в любом случае
        }
    };

    // --- Рендеринг ---
    if (isLoading) {
        return <div className="container mx-auto p-4">Загрузка записей...</div>;
    }

    if (error) {
        return <div className="container mx-auto p-4 text-red-500">{error}</div>;
    }

    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <h1 className="text-2xl font-bold mb-6">Мои записи</h1>

            {appointments.length === 0 ? (
                <p>У вас пока нет записей на прием.</p>
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
                                    // Проверяем, можно ли отменить запись (статус scheduled и дата в будущем)
                                    const canCancel = appointment.status === 'scheduled' && appointment.date && isFuture(parseISO(appointment.date));
                                    const isCancelling = cancellingId === appointment.id;

                                    return (
                                        <TableRow key={appointment.id}>
                                            <TableCell>{appointment.date ? format(parseISO(appointment.date), 'dd.MM.yyyy', { locale: ru }) : 'N/A'}</TableCell>
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
                                                            <Button variant="destructive" size="sm" disabled={isCancelling}>
                                                                {isCancelling ? 'Отмена...' : 'Отменить'}
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Отменить запись?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Вы уверены, что хотите отменить запись к врачу
                                                                    <span className="font-semibold"> {appointment.doctor_name}</span> на
                                                                    <span className="font-semibold"> {appointment.date} в {appointment.start_time}</span>?
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Нет</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleCancelAppointment(appointment.id)} disabled={isCancelling}>
                                                                    Да, отменить
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                ) : (
                                                    // Показываем тире для записей, которые нельзя отменить
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