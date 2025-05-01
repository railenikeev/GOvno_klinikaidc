import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO, isFuture } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Trash2 } from 'lucide-react'; // Иконка

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input"; // Для фильтрации
import { Toaster, toast } from "sonner";

// --- Типы и Mock Данные ---
interface AppointmentAdminView {
    id: number;
    patient_id: number;
    patient_name: string;
    doctor_id: number;
    doctor_name: string;
    date: string;       // Формат<y_bin_46>-MM-DD
    start_time: string; // Формат HH:MM
    status: 'scheduled' | 'completed' | 'cancelled';
    // doctor_schedule_id: number; // Можно добавить если нужно
}

// Создаем mock-данные, связанные с нашими mock-врачами/пациентами
const MOCK_APPOINTMENTS_DATA: AppointmentAdminView[] = [
    { id: 101, patient_id: 3, patient_name: 'Пациент Андреев А.А.', doctor_id: 2, doctor_name: 'Доктор Петров В.А.', date: format(addDays(new Date(), 1), 'yyyy-MM-dd'), start_time: '09:00', status: 'scheduled'},
    { id: 102, patient_id: 6, patient_name: 'Пациентка Белова О.О.', doctor_id: 4, doctor_name: 'Доктор Сидорова Е.П.', date: format(addDays(new Date(), 1), 'yyyy-MM-dd'), start_time: '14:00', status: 'scheduled'},
    { id: 103, patient_id: 3, patient_name: 'Пациент Андреев А.А.', doctor_id: 5, doctor_name: 'Доктор Иванов И.И.', date: format(addDays(new Date(), 2), 'yyyy-MM-dd'), start_time: '14:30', status: 'scheduled'},
    { id: 104, patient_id: 6, patient_name: 'Пациентка Белова О.О.', doctor_id: 2, doctor_name: 'Доктор Петров В.А.', date: format(addDays(new Date(), 3), 'yyyy-MM-dd'), start_time: '11:00', status: 'scheduled'},
    { id: 105, patient_id: 3, patient_name: 'Пациент Андреев А.А.', doctor_id: 4, doctor_name: 'Доктор Сидорова Е.П.', date: format(addDays(new Date(), -1), 'yyyy-MM-dd'), start_time: '14:00', status: 'completed'}, // Прошедшая
    { id: 106, patient_id: 6, patient_name: 'Пациентка Белова О.О.', doctor_id: 5, doctor_name: 'Доктор Иванов И.И.', date: format(addDays(new Date(), -2), 'yyyy-MM-dd'), start_time: '14:30', status: 'completed'}, // Прошедшая
    { id: 107, patient_id: 3, patient_name: 'Пациент Андреев А.А.', doctor_id: 2, doctor_name: 'Доктор Петров В.А.', date: format(addDays(new Date(), -3), 'yyyy-MM-dd'), start_time: '09:30', status: 'cancelled'}, // Отмененная
];
// --- Конец Mock Данных ---

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
    // Используем mock данные
    const [appointments, setAppointments] = useState<AppointmentAdminView[]>(MOCK_APPOINTMENTS_DATA);
    const [isLoading, setIsLoading] = useState<boolean>(false); // Для имитации загрузки в будущем
    const [filterPatient, setFilterPatient] = useState(''); // Состояние для фильтра по пациенту
    const [filterDoctor, setFilterDoctor] = useState(''); // Состояние для фильтра по врачу

    // Состояния для диалога удаления
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingAppointment, setDeletingAppointment] = useState<AppointmentAdminView | null>(null);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);

    // Фильтрация записей на клиенте (т.к. данные mock)
    const filteredAppointments = useMemo(() => {
        return appointments.filter(appt => {
            const patientMatch = !filterPatient || appt.patient_name.toLowerCase().includes(filterPatient.toLowerCase());
            const doctorMatch = !filterDoctor || appt.doctor_name.toLowerCase().includes(filterDoctor.toLowerCase());
            return patientMatch && doctorMatch;
        });
    }, [appointments, filterPatient, filterDoctor]);

    // Открытие диалога удаления
    const handleDeleteClick = (appt: AppointmentAdminView) => {
        if (appt.status !== 'scheduled') {
            toast.info("Можно отменить только запланированные записи.");
            return;
        }
        if (!isFuture(parseISO(appt.date))) {
            toast.info("Нельзя отменить прошедшую запись.");
            return;
        }
        setDeletingAppointment(appt);
        setIsDeleteDialogOpen(true);
    };

    // Подтверждение удаления (имитация)
    const handleDeleteConfirm = async () => {
        if (!deletingAppointment) return;
        setIsDeleting(true);
        setIsDeleteDialogOpen(false);

        try {
            // --- Имитация вызова API ---
            console.log(`Админ имитирует отмену записи ID: ${deletingAppointment.id}`);
            // Закомментировано до реализации бэкенда:
            // await apiClient.patch(`/appointments/${deletingAppointment.id}/status`, { status: 'cancelled' }); // Или DELETE? Зависит от API
            await new Promise(resolve => setTimeout(resolve, 1000));
            // --- Конец имитации ---

            toast.success(`Запись #${deletingAppointment.id} успешно отменена.`);
            // Обновляем статус в локальном состоянии
            setAppointments(prev => prev.map(a =>
                a.id === deletingAppointment.id ? { ...a, status: 'cancelled' } : a
            ));

        } catch (error) {
            console.error("Ошибка отмены записи (админ):", error);
            toast.error("Не удалось отменить запись.");
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
                <Button variant="outline" asChild>
                    <Link to="/">Назад к панели</Link>
                </Button>
            </div>

            {/* Фильтры */}
            <div className="flex flex-col md:flex-row gap-4 mb-4">
                <Input
                    placeholder="Фильтр по имени пациента..."
                    value={filterPatient}
                    onChange={(e) => setFilterPatient(e.target.value)}
                    className="max-w-sm"
                />
                <Input
                    placeholder="Фильтр по имени врача..."
                    value={filterDoctor}
                    onChange={(e) => setFilterDoctor(e.target.value)}
                    className="max-w-sm"
                />
            </div>

            {/* Таблица записей */}
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
                            {isLoading && ( /* Пока не используется, т.к. mock данные */
                                <TableRow> <TableCell colSpan={7} className="h-24 text-center">Загрузка...</TableCell> </TableRow>
                            )}
                            {!isLoading && filteredAppointments.length === 0 ? (
                                <TableRow> <TableCell colSpan={7} className="h-24 text-center">Записи не найдены.</TableCell> </TableRow>
                            ) : (
                                filteredAppointments.map((appointment) => (
                                    <TableRow key={appointment.id}>
                                        <TableCell className="font-mono text-xs">{appointment.id}</TableCell>
                                        <TableCell>{appointment.date ? format(parseISO(appointment.date), 'dd.MM.yyyy', { locale: ru }) : 'N/A'}</TableCell>
                                        <TableCell>{appointment.start_time ?? 'N/A'}</TableCell>
                                        <TableCell>{appointment.patient_name} (ID: {appointment.patient_id})</TableCell>
                                        <TableCell>{appointment.doctor_name} (ID: {appointment.doctor_id})</TableCell>
                                        <TableCell>
                                            <Badge variant={getStatusVariant(appointment.status)}>{appointment.status}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {/* Кнопка Отмены (только для запланированных будущих) */}
                                            {appointment.status === 'scheduled' && isFuture(parseISO(appointment.date)) && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive/80" disabled={isDeleting && deletingAppointment?.id === appointment.id}>
                                                            {isDeleting && deletingAppointment?.id === appointment.id ? <span className="animate-spin text-xs">...</span> : <Trash2 className="h-4 w-4" />}
                                                            <span className="sr-only">Отменить</span>
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    {/* Диалог рендерится только когда открыт */}
                                                    {isDeleteDialogOpen && deletingAppointment?.id === appointment.id && (
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Отменить запись?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Вы уверены, что хотите отменить запись пациента <span className="font-semibold">{deletingAppointment?.patient_name}</span> к врачу <span className="font-semibold">{deletingAppointment?.doctor_name}</span> на <span className="font-semibold">{deletingAppointment?.date} {deletingAppointment?.start_time}</span>?
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel onClick={() => setDeletingAppointment(null)}>Нет</AlertDialogCancel>
                                                                <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                                    {isDeleting ? 'Отмена...' : 'Да, отменить'}
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    )}
                                                </AlertDialog>
                                            )}
                                            {/* Можно добавить кнопку просмотра деталей записи или ЭМК */}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
};

export default ViewAllAppointmentsPage;