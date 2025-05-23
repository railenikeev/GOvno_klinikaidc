// my-clinic-app/src/pages/admin/ViewAllAppointmentsPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO, isFuture } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Trash2, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

import apiClient from '@/services/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster, toast } from "sonner";
import { useAuth } from '@/contexts/AuthContext';

interface AppointmentAdminView {
    id: number;
    patient_id: number;
    patient_name?: string | null;
    doctor_id?: number | null;
    doctor_name?: string | null;
    specialization_name?: string | null;
    date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    status: 'scheduled' | 'completed' | 'cancelled';
    created_at?: string;
    doctor_schedule_id?: number;
}

interface UserSelectItem {
    id: number;
    full_name: string;
}

const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status?.toLowerCase()) {
        case 'completed': return 'default';
        case 'scheduled': return 'secondary';
        case 'cancelled': return 'destructive';
        default: return 'outline';
    }
};

// Объект для перевода статусов
const statusTranslations: { [key: string]: string } = {
    completed: 'Завершена',
    scheduled: 'Запланирована',
    cancelled: 'Отменена',
};

const ViewAllAppointmentsPage: React.FC = () => {
    const { user, isLoading: authIsLoading } = useAuth();
    const [appointments, setAppointments] = useState<AppointmentAdminView[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [filterPatientId, setFilterPatientId] = useState<string | undefined>(undefined);
    const [filterDoctorId, setFilterDoctorId] = useState<string | undefined>(undefined);
    const [doctors, setDoctors] = useState<UserSelectItem[]>([]);
    const [patients, setPatients] = useState<UserSelectItem[]>([]);

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingAppointment, setDeletingAppointment] = useState<AppointmentAdminView | null>(null);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);

    const [isCompletingDialogOpen, setIsCompletingDialogOpen] = useState(false);
    const [completingAppointment, setCompletingAppointment] = useState<AppointmentAdminView | null>(null);
    const [isCompleting, setIsCompleting] = useState<boolean>(false);


    const fetchAllAppointments = useCallback(async (patientIdQuery?: string, doctorIdQuery?: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const params: Record<string, string> = {};
            if (patientIdQuery) params.patient_id = patientIdQuery;
            if (doctorIdQuery) params.doctor_id = doctorIdQuery;

            const response = await apiClient.get<AppointmentAdminView[]>('/appointments', { params });
            response.data.sort((a, b) => {
                const dateA = a.date ? parseISO(a.date) : new Date(0);
                const dateB = b.date ? parseISO(b.date) : new Date(0);
                const dateComparison = dateB.getTime() - dateA.getTime();
                if (dateComparison !== 0) return dateComparison;
                const timeA = a.start_time ?? '00:00';
                const timeB = b.start_time ?? '00:00';
                const fullTimeA = a.date && a.start_time ? parseISO(`${a.date}T${a.start_time}`) : new Date(0);
                const fullTimeB = b.date && b.start_time ? parseISO(`${b.date}T${b.start_time}`) : new Date(0);
                return fullTimeB.getTime() - fullTimeA.getTime();
            });
            setAppointments(response.data || []);
        } catch (err) {
            console.error("Ошибка загрузки всех записей:", err);
            const message = "Не удалось загрузить список записей.";
            setError(message);
            toast.error(message);
            setAppointments([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchUsersForFilters = useCallback(async () => {
        try {
            const [doctorsResponse, patientsResponse] = await Promise.all([
                apiClient.get<UserSelectItem[]>('/users?role=doctor'),
                apiClient.get<UserSelectItem[]>('/users?role=patient')
            ]);
            setDoctors(doctorsResponse.data || []);
            setPatients(patientsResponse.data || []);
        } catch (err) {
            console.error("Ошибка загрузки пользователей для фильтров:", err);
            toast.error("Не удалось загрузить списки врачей/пациентов для фильтрации.");
        }
    }, []);

    useEffect(() => {
        if (authIsLoading) {
            setIsLoading(true);
            return;
        }
        if (user?.role === 'admin') {
            fetchAllAppointments(filterPatientId, filterDoctorId);
            if (doctors.length === 0 && patients.length === 0) {
                fetchUsersForFilters();
            }
        } else {
            setError("Доступ запрещен. Эта страница только для администраторов.");
            setIsLoading(false);
            setAppointments([]);
        }
    }, [user, authIsLoading, fetchAllAppointments, fetchUsersForFilters, filterPatientId, filterDoctorId, doctors.length, patients.length]);

    const handleApplyFilters = () => {
        fetchAllAppointments(filterPatientId, filterDoctorId);
    };

    const handleClearFilters = () => {
        setFilterPatientId(undefined);
        setFilterDoctorId(undefined);
        fetchAllAppointments();
    };

    const handleDeleteClick = (appt: AppointmentAdminView) => {
        if (appt.status !== 'scheduled') {
            toast.info(`Можно отменить только ${statusTranslations['scheduled'].toLowerCase()} записи.`);
            return;
        }
        if (appt.date && !isFuture(parseISO(appt.date))) {
            toast.info("Нельзя отменить прошедшую или сегодняшнюю запись.");
            return;
        }
        setDeletingAppointment(appt);
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!deletingAppointment) return;
        setIsDeleting(true);
        setIsDeleteDialogOpen(false);
        let errorMessage = "Не удалось отменить запись.";
        try {
            await apiClient.delete(`/appointments/${deletingAppointment.id}`);
            toast.success(`Запись #${deletingAppointment.id} успешно отменена (статус изменен на "${statusTranslations['cancelled'] || 'Отменено'}").`);
            await fetchAllAppointments(filterPatientId, filterDoctorId);
        } catch (error) {
            console.error("Ошибка отмены записи (админ):", error);
            if (axios.isAxiosError(error) && error.response) {
                errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            toast.error(errorMessage);
        } finally {
            setIsDeleting(false);
            setDeletingAppointment(null);
        }
    };

    const handleCompleteClick = (appt: AppointmentAdminView) => {
        if (appt.status !== 'scheduled') {
            toast.info(`Можно завершить только ${statusTranslations['scheduled'].toLowerCase()} записи.`);
            return;
        }
        setCompletingAppointment(appt);
        setIsCompletingDialogOpen(true);
    };

    const handleCompleteConfirm = async () => {
        if (!completingAppointment) return;
        setIsCompleting(true);
        setIsCompletingDialogOpen(false);
        let errorMessage = "Не удалось завершить запись.";
        try {
            await apiClient.patch(`/appointments/${completingAppointment.id}/status`, { status: 'completed' });
            toast.success(`Запись #${completingAppointment.id} успешно завершена (статус "${statusTranslations['completed'] || 'Завершено'}").`);
            await fetchAllAppointments(filterPatientId, filterDoctorId);
        } catch (error) {
            console.error("Ошибка завершения записи (админ):", error);
            if (axios.isAxiosError(error) && error.response) {
                errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            toast.error(errorMessage);
        } finally {
            setIsCompleting(false);
            setCompletingAppointment(null);
        }
    };


    if (authIsLoading || (isLoading && appointments.length === 0 && !error)) {
        return <div className="container mx-auto p-4 text-center">Загрузка данных...</div>;
    }

    if (user?.role !== 'admin') {
        return (
            <div className="container mx-auto p-4">
                <Card>
                    <CardHeader><CardTitle>Доступ запрещен</CardTitle></CardHeader>
                    <CardContent>
                        <p>{error || "У вас нет прав для просмотра этой страницы."}</p>
                        <Button variant="outline" asChild className="mt-4"><Link to="/">На главную</Link></Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                <h1 className="text-2xl font-bold">Все Записи на Прием</h1>
                <Button variant="outline" asChild>
                    <Link to="/">Назад к панели администратора</Link>
                </Button>
            </div>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Фильтры</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-end">
                    <div className="space-y-1.5">
                        <label htmlFor="patientFilter" className="text-sm font-medium">Пациент</label>
                        <Select
                            value={filterPatientId || ''}
                            onValueChange={(value) => setFilterPatientId(value === "" ? undefined : value)}
                        >
                            <SelectTrigger id="patientFilter"><SelectValue placeholder="Все пациенты" /></SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectLabel>Пациенты</SelectLabel>
                                    {patients.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.full_name}</SelectItem>)}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="doctorFilter" className="text-sm font-medium">Врач</label>
                        <Select
                            value={filterDoctorId || ''}
                            onValueChange={(value) => setFilterDoctorId(value === "" ? undefined : value)}
                        >
                            <SelectTrigger id="doctorFilter"><SelectValue placeholder="Все врачи" /></SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectLabel>Врачи</SelectLabel>
                                    {doctors.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.full_name}</SelectItem>)}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex gap-2 pt-4 sm:pt-0">
                        <Button onClick={handleApplyFilters} className="w-full sm:w-auto">Применить</Button>
                        <Button onClick={handleClearFilters} variant="outline" className="w-full sm:w-auto">Сбросить</Button>
                    </div>
                </CardContent>
            </Card>

            {isLoading && appointments.length > 0 && <div className="p-6 text-center">Обновление записей...</div>}
            {error && <div className="p-6 text-center text-red-500">{error}</div>}
            {!isLoading && !error && (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[70px]">ID</TableHead>
                                    <TableHead>Дата</TableHead>
                                    <TableHead>Время</TableHead>
                                    <TableHead>Пациент</TableHead>
                                    <TableHead>Врач</TableHead>
                                    <TableHead>Специализация</TableHead>
                                    <TableHead>Статус</TableHead>
                                    <TableHead className="text-right w-[120px]">Действия</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {appointments.length === 0 ? (
                                    <TableRow> <TableCell colSpan={8} className="h-24 text-center">Записи не найдены.</TableCell> </TableRow>
                                ) : (
                                    appointments.map((appointment) => {
                                        const canCancel = appointment.status === 'scheduled' && appointment.date && isFuture(parseISO(appointment.date));
                                        const canComplete = appointment.status === 'scheduled';
                                        return (
                                            <TableRow key={appointment.id}>
                                                <TableCell className="font-mono text-xs">{appointment.id}</TableCell>
                                                <TableCell>{appointment.date ? format(parseISO(appointment.date), 'dd.MM.yyyy', { locale: ru }) : 'N/A'}</TableCell>
                                                <TableCell>{appointment.start_time ?? 'N/A'}</TableCell>
                                                <TableCell>{appointment.patient_name ?? `Пациент ID: ${appointment.patient_id}`}</TableCell>
                                                <TableCell>{appointment.doctor_name ?? `Врач ID: ${appointment.doctor_id}`}</TableCell>
                                                <TableCell>{appointment.specialization_name ?? '-'}</TableCell>
                                                <TableCell>
                                                    <Badge variant={getStatusVariant(appointment.status)}>
                                                        {statusTranslations[appointment.status.toLowerCase()] || appointment.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right space-x-1">
                                                    {canComplete && (
                                                        <AlertDialog
                                                            open={isCompletingDialogOpen && completingAppointment?.id === appointment.id}
                                                            onOpenChange={(open) => { if (!open) { setIsCompletingDialogOpen(false); setCompletingAppointment(null); } }}
                                                        >
                                                            <AlertDialogTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700" onClick={() => handleCompleteClick(appointment)} disabled={isCompleting && completingAppointment?.id === appointment.id} title="Завершить">
                                                                    {isCompleting && completingAppointment?.id === appointment.id ? <span className="animate-spin text-xs">...</span> : <CheckCircle2 className="h-4 w-4" />}
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            {completingAppointment?.id === appointment.id && (
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader> <AlertDialogTitle>Завершить запись?</AlertDialogTitle> <AlertDialogDescription> Вы уверены, что хотите отметить запись пациента <span className="font-semibold">{completingAppointment?.patient_name}</span> к врачу <span className="font-semibold">{completingAppointment?.doctor_name}</span> на <span className="font-semibold">{completingAppointment?.date ? format(parseISO(completingAppointment.date), 'dd.MM.yyyy') : ''} {completingAppointment?.start_time ? completingAppointment.start_time.substring(0,5) : ''}</span> как завершенную? </AlertDialogDescription> </AlertDialogHeader>
                                                                    <AlertDialogFooter> <AlertDialogCancel onClick={() => {setIsCompletingDialogOpen(false); setCompletingAppointment(null);}} disabled={isCompleting}>Нет</AlertDialogCancel> <AlertDialogAction onClick={handleCompleteConfirm} disabled={isCompleting} className="bg-green-600 text-white hover:bg-green-700"> {isCompleting ? 'Завершение...' : 'Да, завершить'} </AlertDialogAction> </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            )}
                                                        </AlertDialog>
                                                    )}
                                                    {canCancel && (
                                                        <AlertDialog
                                                            open={isDeleteDialogOpen && deletingAppointment?.id === appointment.id}
                                                            onOpenChange={(open) => { if (!open) { setIsDeleteDialogOpen(false); setDeletingAppointment(null); } }}
                                                        >
                                                            <AlertDialogTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive/80" onClick={() => handleDeleteClick(appointment)} disabled={isDeleting && deletingAppointment?.id === appointment.id} title="Отменить">
                                                                    {isDeleting && deletingAppointment?.id === appointment.id ? <span className="animate-spin text-xs">...</span> : <Trash2 className="h-4 w-4" />}
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            {deletingAppointment?.id === appointment.id && (
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader> <AlertDialogTitle>Отменить запись?</AlertDialogTitle> <AlertDialogDescription> Вы уверены, что хотите отменить запись пациента <span className="font-semibold">{deletingAppointment?.patient_name}</span> к врачу <span className="font-semibold">{deletingAppointment?.doctor_name}</span> на <span className="font-semibold">{deletingAppointment?.date ? format(parseISO(deletingAppointment.date), 'dd.MM.yyyy') : ''} {deletingAppointment?.start_time ? deletingAppointment.start_time.substring(0,5) : ''}</span>? </AlertDialogDescription> </AlertDialogHeader>
                                                                    <AlertDialogFooter> <AlertDialogCancel onClick={() => {setIsDeleteDialogOpen(false); setDeletingAppointment(null);}} disabled={isDeleting}>Нет</AlertDialogCancel> <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"> {isDeleting ? 'Отмена...' : 'Да, отменить'} </AlertDialogAction> </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            )}
                                                        </AlertDialog>
                                                    )}
                                                    {(!canCancel && !canComplete) && <span className="text-xs text-muted-foreground">-</span>}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default ViewAllAppointmentsPage;