import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns'; // Убедитесь, что импорт format и parseISO есть
import { ru } from 'date-fns/locale'; // Убедитесь, что импорт локали есть
import { Trash2 } from 'lucide-react';
//import axios from 'axios';

import apiClient from '@/services/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Toaster, toast } from "sonner";

interface Doctor {
    id: number;
    full_name: string;
}

interface ScheduleSlot {
    id: number;
    doctor_id: number;
    date: string;
    start_time: string;
    end_time: string;
    is_available: boolean;
}

const ManageAllSchedulesPage: React.FC = () => {
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
    const [slots, setSlots] = useState<ScheduleSlot[]>([]);
    const [isLoadingDoctors, setIsLoadingDoctors] = useState<boolean>(true);
    const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingSlot, setDeletingSlot] = useState<ScheduleSlot | null>(null);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);

    const fetchDoctors = useCallback(async () => {
        setIsLoadingDoctors(true);
        setError(null);
        try {
            const response = await apiClient.get<Doctor[]>('/users?role=doctor');
            setDoctors(response.data || []);
        } catch (err) {
            console.error("Ошибка загрузки врачей:", err);
            setError("Не удалось загрузить список врачей.");
            toast.error("Не удалось загрузить список врачей.");
            setDoctors([]);
        } finally {
            setIsLoadingDoctors(false);
        }
    }, []);

    useEffect(() => {
        fetchDoctors();
    }, [fetchDoctors]);

    const fetchSlotsForDoctor = useCallback(async (doctorId: number) => {
        if (!doctorId) return;
        setIsLoadingSlots(true);
        setError(null);
        setSlots([]);
        try {
            const response = await apiClient.get<ScheduleSlot[]>(`/schedules/doctor/${doctorId}`);
            setSlots(Array.isArray(response.data) ? response.data.sort((a, b) => {
                const dateComparison = a.date.localeCompare(b.date);
                if (dateComparison !== 0) return dateComparison;
                return a.start_time.localeCompare(b.start_time);
            }) : []);
        } catch (err) {
            console.error(`Ошибка загрузки слотов для врача ${doctorId}:`, err);
            setError("Не удалось загрузить расписание для выбранного врача.");
            toast.error("Не удалось загрузить расписание для выбранного врача.");
            setSlots([]);
        } finally {
            setIsLoadingSlots(false);
        }
    }, []);

    useEffect(() => {
        const doctorIdNum = parseInt(selectedDoctorId, 10);
        if (doctorIdNum > 0) {
            fetchSlotsForDoctor(doctorIdNum);
        } else {
            setSlots([]);
        }
    }, [selectedDoctorId, fetchSlotsForDoctor]);

    const handleDeleteClick = (slot: ScheduleSlot) => {
        if (!slot.is_available) {
            toast.info("Нельзя удалить слот, на который уже есть запись.");
            return;
        }
        setDeletingSlot(slot);
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!deletingSlot) return;
        setIsDeleting(true);
        try {
            await apiClient.delete(`/schedules/${deletingSlot.id}`);
            toast.success(`Слот ${deletingSlot.date} ${deletingSlot.start_time} успешно удален.`);
            if (selectedDoctorId) {
                await fetchSlotsForDoctor(parseInt(selectedDoctorId, 10));
            }
            setIsDeleteDialogOpen(false);
            setDeletingSlot(null);
        } catch (error: any) {
            console.error("Ошибка удаления слота (админ):", error);
            const errorMessage = error.response?.data?.error || error.message || "Не удалось удалить слот.";
            toast.error(errorMessage);
        } finally {
            setIsDeleting(false);
        }
    };

    const groupedSlots = useMemo(() => {
        return slots.reduce((acc, slot) => {
            (acc[slot.date] = acc[slot.date] || []).push(slot);
            return acc;
        }, {} as Record<string, ScheduleSlot[]>);
    }, [slots]);

    const selectedDoctorFullName = useMemo(() => {
        if (!selectedDoctorId) return '';
        const doctor = doctors.find(d => d.id === parseInt(selectedDoctorId, 10));
        return doctor?.full_name ?? '';
    }, [selectedDoctorId, doctors]);


    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                <h1 className="text-2xl font-bold">Управление Расписаниями</h1>
                <div className="flex gap-2">
                    <Button variant="outline" asChild>
                        <Link to="/">Назад к панели</Link>
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Выберите врача</CardTitle>
                    <CardDescription>Выберите врача для просмотра и управления его расписанием.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Select
                        value={selectedDoctorId}
                        onValueChange={setSelectedDoctorId}
                        disabled={isLoadingDoctors}
                    >
                        <SelectTrigger className="w-full md:w-[300px]">
                            <SelectValue
                                placeholder={
                                    isLoadingDoctors
                                        ? "Загрузка врачей..."
                                        : doctors.length === 0
                                            ? "Врачи не найдены"
                                            : "Выберите врача..."
                                }
                            />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectLabel>Врачи</SelectLabel>
                                {isLoadingDoctors ? (
                                    <SelectItem value="loading" disabled>Загрузка...</SelectItem>
                                ) : doctors.length === 0 ? (
                                    <SelectItem value="no-doctors" disabled>Врачи не найдены</SelectItem>
                                ) : (
                                    doctors.map(doc => (
                                        <SelectItem key={doc.id} value={doc.id.toString()}>
                                            {doc.full_name} (ID: {doc.id})
                                        </SelectItem>
                                    ))
                                )}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    {error && !isLoadingSlots && !isLoadingDoctors && (
                        <p className="text-sm font-medium text-destructive mt-2">{error}</p>
                    )}
                </CardContent>
            </Card>

            {selectedDoctorId && (
                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle>Расписание врача: {selectedDoctorFullName}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoadingSlots && <p>Загрузка слотов...</p>}
                        {!isLoadingSlots && !error && slots.length === 0 && (
                            <p>Слоты не найдены для выбранного врача.</p>
                        )}
                        {!isLoadingSlots && error && slots.length === 0 && (
                            <p className="text-sm font-medium text-destructive">{error}</p>
                        )}
                        {!isLoadingSlots && slots.length > 0 && (
                            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                                {Object.entries(groupedSlots).map(([date, slotsInDate]) => (
                                    <div key={date}>
                                        <h3 className="font-semibold mb-2 text-lg">
                                            {/* ИСПРАВЛЕНИЕ ЗДЕСЬ */}
                                            {format(parseISO(date), 'd MMMM yyyy, EEEE', { locale: ru })}
                                        </h3>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {slotsInDate.map((slot) => (
                                                <div key={slot.id} className="flex items-center gap-1">
                                                    <Badge variant={slot.is_available ? 'outline' : 'secondary'}>
                                                        {slot.start_time} - {slot.end_time} {!slot.is_available ? '(Занят)' : ''}
                                                    </Badge>
                                                    {slot.is_available && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                                            onClick={() => handleDeleteClick(slot)}
                                                            disabled={isDeleting && deletingSlot?.id === slot.id}
                                                            aria-label="Удалить слот"
                                                        >
                                                            {isDeleting && deletingSlot?.id === slot.id ?
                                                                (<span className="animate-spin text-xs">...</span>) :
                                                                (<Trash2 className="h-3 w-3" />)
                                                            }
                                                        </Button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <AlertDialog
                open={isDeleteDialogOpen}
                onOpenChange={(open) => {
                    setIsDeleteDialogOpen(open);
                    if (!open) {
                        setDeletingSlot(null);
                    }
                }}
            >
                <AlertDialogContent>
                    {deletingSlot ? (
                        <>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Подтвердить удаление</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Вы уверены, что хотите удалить слот
                                    <span className="font-semibold"> {deletingSlot.date} {deletingSlot.start_time}</span> для врача
                                    <span className="font-semibold"> {doctors.find(d => d.id === deletingSlot.doctor_id)?.full_name ?? `ID ${deletingSlot.doctor_id}`}</span>?
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel
                                    onClick={() => { /* onOpenChange уже должен обработать */ }}
                                    disabled={isDeleting}
                                >
                                    Отмена
                                </AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleDeleteConfirm}
                                    disabled={isDeleting}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                    {isDeleting ? 'Удаление...' : 'Удалить'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </>
                    ) : (
                        <AlertDialogHeader>
                            <AlertDialogTitle>Ошибка</AlertDialogTitle>
                            <AlertDialogDescription>Слот для удаления не определен.</AlertDialogDescription>
                            <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)}>Закрыть</AlertDialogCancel>
                            </AlertDialogFooter>
                        </AlertDialogHeader>
                    )}
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default ManageAllSchedulesPage;