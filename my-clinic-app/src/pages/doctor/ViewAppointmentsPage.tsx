// src/pages/ViewAllAppointmentsPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO, isFuture } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Trash2 } from 'lucide-react';
import axios from 'axios';

import apiClient from '@/services/apiClient';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Toaster, toast } from 'sonner';
import { cn } from '@/lib/utils'; // если у вас есть util-функция classNames

/* ---------- Типы ---------- */
interface AppointmentAdminView {
    id: number;
    patient_id: number;
    patient_name: string;
    doctor_id: number;
    doctor_name: string;
    date: string;
    start_time: string;
    status: 'scheduled' | 'completed' | 'cancelled';
    created_at?: string;
    doctor_schedule_id?: number;
}

/* ---------- helpers ---------- */
const getStatusVariant = (
    status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status?.toLowerCase()) {
        case 'completed':
            return 'default';
        case 'scheduled':
            return 'secondary';
        case 'cancelled':
            return 'destructive';
        default:
            return 'outline';
    }
};

const ViewAllAppointmentsPage: React.FC = () => {
    /* ---------- state ---------- */
    const [appointments, setAppointments] = useState<AppointmentAdminView[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterPatient, setFilterPatient] = useState('');
    const [filterDoctor, setFilterDoctor] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [activeAppt, setActiveAppt] = useState<AppointmentAdminView | null>(
        null,
    );

    /* ---------- fetch ---------- */
    const fetchAll = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const { data } = await apiClient.get<AppointmentAdminView[]>('/appointments');

            data.sort(
                (a, b) =>
                    b.date.localeCompare(a.date) ||
                    b.start_time.localeCompare(a.start_time),
            );
            setAppointments(data);
        } catch (e) {
            console.error(e);
            setError('Не удалось загрузить список записей.');
            toast.error('Не удалось загрузить список записей.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll().catch(console.error);
    }, [fetchAll]);

    /* ---------- memo ---------- */
    const filtered = useMemo(
        () =>
            appointments.filter((a) => {
                const p =
                    !filterPatient ||
                    a.patient_name.toLowerCase().includes(filterPatient.toLowerCase());
                const d =
                    !filterDoctor ||
                    a.doctor_name.toLowerCase().includes(filterDoctor.toLowerCase());
                return p && d;
            }),
        [appointments, filterPatient, filterDoctor],
    );

    /* ---------- delete ---------- */
    const handleAskDelete = (a: AppointmentAdminView) => {
        if (a.status !== 'scheduled')
            return toast.info('Можно отменить только запланированные записи.');
        if (!isFuture(parseISO(a.date)))
            return toast.info('Нельзя отменить прошедшую запись.');

        setActiveAppt(a);
        setConfirmOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!activeAppt) return;
        setDeleting(true);
        try {
            await apiClient.delete(`/appointments/${activeAppt.id}`);
            toast.success(`Запись #${activeAppt.id} отменена.`);
            await fetchAll();
        } catch (e) {
            console.error(e);
            const msg =
                axios.isAxiosError(e) && e.response
                    ? e.response.data?.error || `Ошибка сервера (${e.response.status})`
                    : 'Не удалось отменить запись.';
            toast.error(msg);
        } finally {
            setDeleting(false);
            setActiveAppt(null);
            setConfirmOpen(false);
        }
    };

    /* ---------- render ---------- */
    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />

            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Все Записи на приём</h1>

                {/* Кнопка-ссылка без asChild */}
                <Link
                    to="/"
                    className={cn(buttonVariants({ variant: 'outline' }))}
                >
                    Назад к панели
                </Link>
            </div>

            {/* Фильтры */}
            <div className="flex flex-col md:flex-row gap-4 mb-4">
                <Input
                    placeholder="Фильтр по имени пациента…"
                    value={filterPatient}
                    onChange={(e) => setFilterPatient(e.target.value)}
                    className="max-w-sm"
                />
                <Input
                    placeholder="Фильтр по имени врача…"
                    value={filterDoctor}
                    onChange={(e) => setFilterDoctor(e.target.value)}
                    className="max-w-sm"
                />
            </div>

            {/* Контент */}
            {isLoading && <p>Загрузка записей…</p>}
            {error && <p className="text-red-500">{error}</p>}

            {!isLoading && !error && (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[80px]">ID</TableHead>
                                    <TableHead>Дата</TableHead>
                                    <TableHead>Время</TableHead>
                                    <TableHead>Пациент</TableHead>
                                    <TableHead>Врач</TableHead>
                                    <TableHead>Статус</TableHead>
                                    <TableHead className="text-right w-[100px]">Действия</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {filtered.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-24 text-center">
                                            Записи не найдены.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filtered.map((a) => (
                                        <TableRow key={a.id}>
                                            <TableCell className="font-mono text-xs">{a.id}</TableCell>
                                            <TableCell>
                                                {format(parseISO(a.date), 'dd.MM.yyyy', { locale: ru })}
                                            </TableCell>
                                            <TableCell>{a.start_time}</TableCell>
                                            <TableCell>
                                                {a.patient_name} (ID: {a.patient_id})
                                            </TableCell>
                                            <TableCell>
                                                {a.doctor_name} (ID: {a.doctor_id})
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={getStatusVariant(a.status)}>
                                                    {a.status}
                                                </Badge>
                                            </TableCell>

                                            <TableCell className="text-right">
                                                {a.status === 'scheduled' && isFuture(parseISO(a.date)) ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive hover:text-destructive/80"
                                                        disabled={deleting && activeAppt?.id === a.id}
                                                        onClick={() => handleAskDelete(a)}
                                                    >
                                                        {deleting && activeAppt?.id === a.id ? (
                                                            <span className="animate-spin text-xs">…</span>
                                                        ) : (
                                                            <Trash2 className="h-4 w-4" />
                                                        )}
                                                        <span className="sr-only">Отменить</span>
                                                    </Button>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Диалог подтверждения ― управляем вручную, без Trigger/Slot */}
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Отменить запись?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Вы уверены, что хотите отменить запись&nbsp;
                            <strong>{activeAppt?.patient_name}</strong> к&nbsp;
                            <strong>{activeAppt?.doctor_name}</strong> на&nbsp;
                            <strong>
                                {activeAppt?.date} {activeAppt?.start_time}
                            </strong>
                            ?
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Нет</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            disabled={deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting ? 'Отмена…' : 'Да, отменить'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default ViewAllAppointmentsPage;
