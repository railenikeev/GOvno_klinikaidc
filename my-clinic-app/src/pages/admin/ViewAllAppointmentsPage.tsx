import React, { useState, useEffect, useMemo, useCallback } from 'react'; // Добавили useCallback
import { Link } from 'react-router-dom';
import { format, parseISO, isFuture } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Trash2 } from 'lucide-react';
import axios from 'axios'; // Для проверки ошибок

import apiClient from '@/services/apiClient'; // Подключаем apiClient
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card'; // Убрали CardHeader/Title
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Toaster, toast } from "sonner";
// import { useAuth } from '@/contexts/AuthContext'; // Не нужен здесь напрямую

// --- Тип ---
interface AppointmentAdminView {
    id: number;
    patient_id: number;
    patient_name: string; // Бэкенд должен возвращать это
    doctor_id: number;    // Бэкенд должен возвращать это
    doctor_name: string;  // Бэкенд должен возвращать это
    date: string;         // Бэкенд должен возвращать это
    start_time: string;   // Бэкенд должен возвращать это
    status: 'scheduled' | 'completed' | 'cancelled';
    // Добавим опционально, если бэкенд возвращает
    created_at?: string;
    doctor_schedule_id?: number;
}
// --- Конец Тип ---

// УДАЛЕН MOCK_APPOINTMENTS_DATA

// Варианты Badge для статуса
const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status?.toLowerCase()) {
        case 'completed': return 'default';
        case 'scheduled': return 'secondary';
        case 'cancelled': return 'destructive';
        default: return 'outline';
    }
};


const ViewAllAppointmentsPage: React.FC = () => {
    const [appointments, setAppointments] = useState<AppointmentAdminView[]>([]); // Начинаем с пустого массива
    const [isLoading, setIsLoading] = useState<boolean>(true); // Ставим true для начальной загрузки
    const [error, setError] = useState<string | null>(null); // Для ошибок загрузки
    const [filterPatient, setFilterPatient] = useState('');
    const [filterDoctor, setFilterDoctor] = useState('');

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingAppointment, setDeletingAppointment] = useState<AppointmentAdminView | null>(null);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);

    // --- Функция загрузки ВСЕХ записей ---
    const fetchAllAppointments = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Используем новый эндпоинт GET /appointments (без /my/...)
            // TODO: Добавить query-параметры для серверной фильтрации, если нужно
            const response = await apiClient.get<AppointmentAdminView[]>('/appointments');
            // Сортировка на клиенте (или бэкенд должен сортировать?)
            response.data.sort((a, b) => {
                const dateA = a.date ?? '0000-00-00';
                const dateB = b.date ?? '0000-00-00';
                const dateComparison = dateB.localeCompare(dateA); // Новые сначала
                if (dateComparison !== 0) return dateComparison;
                const timeA = a.start_time ?? '00:00';
                const timeB = b.start_time ?? '00:00';
                return timeB.localeCompare(timeA); // По времени тоже новые сначала
            });
            setAppointments(response.data);
        } catch (err) {
            console.error("Ошибка загрузки всех записей:", err);
            const message = "Не удалось загрузить список записей.";
            setError(message);
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    }, []); // useCallback

    // Загружаем данные при монтировании
    useEffect(() => {
        fetchAllAppointments().catch(console.error);
    }, [fetchAllAppointments]);


    // Фильтрация записей на клиенте
    const filteredAppointments = useMemo(() => {
        return appointments.filter(appt => {
            const patientMatch = !filterPatient || appt.patient_name?.toLowerCase().includes(filterPatient.toLowerCase());
            const doctorMatch = !filterDoctor || appt.doctor_name?.toLowerCase().includes(filterDoctor.toLowerCase());
            return patientMatch && doctorMatch;
        });
    }, [appointments, filterPatient, filterDoctor]);

    // Открытие диалога удаления
    const handleDeleteClick = (appt: AppointmentAdminView) => {
        if (appt.status !== 'scheduled') { toast.info("Можно отменить только запланированные записи."); return; }
        if (!isFuture(parseISO(appt.date))) { toast.info("Нельзя отменить прошедшую запись."); return; }
        setDeletingAppointment(appt);
        setIsDeleteDialogOpen(true);
    };

    // Подтверждение удаления (использует реальный API)
    const handleDeleteConfirm = async () => {
        if (!deletingAppointment) return;
        setIsDeleting(true);
        setIsDeleteDialogOpen(false);
        let errorMessage = "Не удалось отменить запись.";

        try {
            await apiClient.delete(`/appointments/${deletingAppointment.id}`); // DELETE /api/appointments/:id
            toast.success(`Запись #${deletingAppointment.id} успешно отменена (удалена).`);
            // Обновляем список, перезагружая данные
            await fetchAllAppointments(); // <--- Перезагружаем весь список

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


    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Все Записи на прием</h1>
                <Button variant="outline" asChild> <Link to="/">Назад к панели</Link> </Button>
            </div>

            {/* Фильтры */}
            <div className="flex flex-col md:flex-row gap-4 mb-4">
                <Input placeholder="Фильтр по имени пациента..." value={filterPatient} onChange={(e) => setFilterPatient(e.target.value)} className="max-w-sm" />
                <Input placeholder="Фильтр по имени врача..." value={filterDoctor} onChange={(e) => setFilterDoctor(e.target.value)} className="max-w-sm"/>
            </div>

            {/* Таблица записей */}
            {isLoading && <p>Загрузка записей...</p>}
            {error && <p className="text-red-500">{error}</p>}
            {!isLoading && !error && (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[80px]">ID Записи</TableHead>
                                    <TableHead>Дата</TableHead>
                                    <TableHead>Время</TableHead>
                                    <TableHead>Пациент</TableHead>
                                    <TableHead>Врач</TableHead>
                                    <TableHead>Статус</TableHead>
                                    <TableHead className="text-right w-[100px]">Действия</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredAppointments.length === 0 ? (
                                    <TableRow> <TableCell colSpan={7} className="h-24 text-center">Записи не найдены (с учетом фильтров).</TableCell> </TableRow>
                                ) : (
                                    filteredAppointments.map((appointment) => (
                                        <TableRow key={appointment.id}>
                                            <TableCell className="font-mono text-xs">{appointment.id}</TableCell>
                                            <TableCell>{appointment.date ? format(parseISO(appointment.date), 'dd.MM.yyyy', { locale: ru }) : 'N/A'}</TableCell>
                                            <TableCell>{appointment.start_time ?? 'N/A'}</TableCell>
                                            <TableCell>{appointment.patient_name} (ID: {appointment.patient_id})</TableCell>
                                            <TableCell>{appointment.doctor_name} (ID: {appointment.doctor_id})</TableCell>
                                            <TableCell><Badge variant={getStatusVariant(appointment.status)}>{appointment.status}</Badge></TableCell>
                                            <TableCell className="text-right">
                                                {appointment.status === 'scheduled' && isFuture(parseISO(appointment.date)) && (
                                                    <AlertDialog open={isDeleteDialogOpen && deletingAppointment?.id === appointment.id} onOpenChange={ (open) => {if(!open) setIsDeleteDialogOpen(false)} }>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive/80" onClick={() => handleDeleteClick(appointment)} disabled={isDeleting && deletingAppointment?.id === appointment.id}>
                                                                {isDeleting && deletingAppointment?.id === appointment.id ? <span className="animate-spin text-xs">...</span> : <Trash2 className="h-4 w-4" />}
                                                                <span className="sr-only">Отменить</span>
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        {deletingAppointment?.id === appointment.id && (
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader> <AlertDialogTitle>Отменить запись?</AlertDialogTitle> <AlertDialogDescription> Вы уверены, что хотите отменить запись пациента <span className="font-semibold">{deletingAppointment?.patient_name}</span> к врачу <span className="font-semibold">{deletingAppointment?.doctor_name}</span> на <span className="font-semibold">{deletingAppointment?.date} {deletingAppointment?.start_time}</span>? </AlertDialogDescription> </AlertDialogHeader>
                                                                <AlertDialogFooter> <AlertDialogCancel onClick={() => setDeletingAppointment(null)}>Нет</AlertDialogCancel> <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"> {isDeleting ? 'Отмена...' : 'Да, отменить'} </AlertDialogAction> </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        )}
                                                    </AlertDialog>
                                                )}
                                                {appointment.status !== 'scheduled' && <span className="text-xs text-muted-foreground">-</span>}
                                            </TableCell>
                                        </TableRow>
                                    ))
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