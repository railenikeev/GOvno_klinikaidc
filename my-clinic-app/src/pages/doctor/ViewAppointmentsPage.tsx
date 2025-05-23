import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
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

interface AppointmentDoctorView {
    id: number;
    patient_id?: number;
    patient_name?: string;
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

const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status?.toLowerCase()) {
        case 'completed': return 'default';
        case 'scheduled': return 'secondary';
        case 'cancelled': return 'destructive';
        default: return 'outline';
    }
};


const ViewAppointmentsPage: React.FC = () => {
    const { user } = useAuth();
    const [appointments, setAppointments] = useState<AppointmentDoctorView[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);

    const fetchDoctorAppointments = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await apiClient.get<AppointmentDoctorView[]>('/appointments/my/doctor');
            setAppointments(response.data);
        } catch (err) {
            console.error("Ошибка загрузки записей врача:", err);
            setError("Не удалось загрузить записи.");
            toast.error("Не удалось загрузить записи.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user && user.role === 'doctor') {
            fetchDoctorAppointments().catch(console.error);
        }
    }, [user, fetchDoctorAppointments]);

    const handleUpdateStatus = async (appointmentId: number, newStatus: 'completed' | 'cancelled') => {
        if (updatingStatusId) return;
        setUpdatingStatusId(appointmentId);

        try {
            await apiClient.patch(`/appointments/${appointmentId}/status`, { status: newStatus });
            toast.success(`Статус записи #<span class="math-inline">\{appointmentId\} изменен на "</span>{statusTranslations[newStatus.toLowerCase()] || newStatus}"`);
            await fetchDoctorAppointments();
        } catch (error) {
            console.error(`Ошибка изменения статуса записи #${appointmentId}:`, error);
            let message = "Не удалось изменить статус записи.";
            if (axios.isAxiosError(error) && error.response) {
                message = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
            } else if (error instanceof Error) {
                message = error.message;
            }
            toast.error(message);
        } finally {
            setUpdatingStatusId(null);
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
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Мои записи (Врач)</h1>
                <Button variant="outline" asChild>
                    <Link to="/">Назад к панели</Link>
                </Button>
            </div>

            {appointments.length === 0 ? (
                <p>У вас пока нет записей пациентов.</p>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Дата</TableHead>
                                    <TableHead>Время</TableHead>
                                    <TableHead>Пациент</TableHead>
                                    <TableHead>Статус</TableHead>
                                    <TableHead className="text-right">Действия</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {appointments.map((appointment) => {
                                    const isUpdating = updatingStatusId === appointment.id;
                                    const canComplete = appointment.status === 'scheduled';

                                    return (
                                        <TableRow key={appointment.id}>
                                            <TableCell>{appointment.date ? format(parseISO(appointment.date), 'dd.MM.yyyy', { locale: ru }) : 'N/A'}</TableCell>
                                            <TableCell>{appointment.start_time ?? 'N/A'}</TableCell>
                                            <TableCell>{appointment.patient_name ?? 'N/A'}</TableCell>
                                            <Badge variant={getStatusVariant(appointment.status)}>
                                                {statusTranslations[appointment.status.toLowerCase()] || appointment.status}
                                            </Badge>
                                            <TableCell className="text-right space-x-2">
                                                {}
                                                {canComplete && (
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="default" size="sm" disabled={isUpdating}>
                                                                {isUpdating ? '...' : 'Завершить'}
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Завершить прием?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Вы уверены, что хотите отметить прием пациента
                                                                    <span className="font-semibold"> {appointment.patient_name}</span> от
                                                                    <span className="font-semibold"> {appointment.date} {appointment.start_time}</span> как завершенный?
                                                                    Не забудьте заполнить медкарту.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Отмена</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleUpdateStatus(appointment.id, 'completed')}>
                                                                    Да, завершить
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                )}
                                                {}
                                                <Button variant="outline" size="sm" asChild>
                                                    {}
                                                    <Link to={`/patient-record/${appointment.patient_id}`}>ЭМК</Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default ViewAppointmentsPage;