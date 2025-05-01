import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO, isFuture } from 'date-fns';
import { ru } from 'date-fns/locale';

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
// Удалили CardHeader, CardTitle
import { Card, CardContent } from '@/components/ui/card';
// Удалили TableCaption
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
    date?: string; // YYYY-MM-DD
    start_time?: string; // HH:MM
    end_time?: string; // HH:MM
    status: string;
    created_at: string;
    doctor_schedule_id: number;
}

const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status.toLowerCase()) {
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
    const [cancellingId, setCancellingId] = useState<number | null>(null);

    const fetchAppointments = async () => {
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
    };

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
    }, [user]);

    const handleCancelAppointment = async (appointmentId: number) => {
        setCancellingId(appointmentId);
        try {
            // !!! ВАЖНО: Реализовать DELETE /appointments/:id на бэкенде !!!
            // const response = await apiClient.delete(`/appointments/${appointmentId}`);

            // --- Имитация Успеха ---
            console.log(`Имитация отмены записи с ID: ${appointmentId}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Удалили строку: if (Math.random() < 0.1) throw new Error("Имитация ошибки сети");
            // --- Конец Имитации ---

            toast.success("Запись успешно отменена!");
            fetchAppointments().catch(console.error); // Перезагружаем список

        } catch (error) {
            console.error("Ошибка отмены записи:", error);
            toast.error("Не удалось отменить запись. Попробуйте снова.");
        } finally {
            setCancellingId(null);
        }
    };

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
                                                                <AlertDialogAction onClick={() => handleCancelAppointment(appointment.id)}>
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