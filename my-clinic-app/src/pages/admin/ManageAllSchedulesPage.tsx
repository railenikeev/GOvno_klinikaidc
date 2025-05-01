import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns'; // Убрали addDays
import { ru } from 'date-fns/locale';
import { Trash2 } from 'lucide-react';
import axios from 'axios'; // Для проверки ошибок

import apiClient from '@/services/apiClient'; // Подключаем apiClient
//import { useAuth } from '@/contexts/AuthContext'; // Не нужен здесь напрямую
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Toaster, toast } from "sonner";

// --- Типы ---
// Тип для врача (из ответа GET /users?role=doctor)
interface Doctor {
    id: number;
    full_name: string; // Бэкенд возвращает full_name
    // Можно добавить specialization_name если нужно в Select
}

// Тип для слота (из ответа GET /schedules/*)
interface ScheduleSlot {
    id: number;
    doctor_id: number;
    date: string;
    start_time: string;
    end_time: string;
    is_available: boolean;
}
// --- Конец Типы ---

// УДАЛЕНЫ MOCK_DOCTORS_LIST и generateMockSlots


const ManageAllSchedulesPage: React.FC = () => {
    const [doctors, setDoctors] = useState<Doctor[]>([]); // Список врачей
    const [selectedDoctorId, setSelectedDoctorId] = useState<string>(''); // ID выбранного врача
    const [slots, setSlots] = useState<ScheduleSlot[]>([]); // Слоты выбранного врача
    const [isLoadingDoctors, setIsLoadingDoctors] = useState<boolean>(true); // Загрузка врачей
    const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false); // Загрузка слотов
    const [error, setError] = useState<string | null>(null); // Общая ошибка загрузки

    // Состояния для удаления
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingSlot, setDeletingSlot] = useState<ScheduleSlot | null>(null);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);

    // --- Загрузка данных ---
    // Загрузка списка врачей при монтировании
    const fetchDoctors = useCallback(async () => {
        setIsLoadingDoctors(true);
        setError(null); // Сбрасываем общую ошибку
        try {
            const response = await apiClient.get<Doctor[]>('/users?role=doctor'); // GET /api/users?role=doctor
            setDoctors(response.data);
        } catch (err) {
            console.error("Ошибка загрузки врачей:", err);
            const message = "Не удалось загрузить список врачей.";
            setError(message); // Устанавливаем общую ошибку
            toast.error(message);
        } finally {
            setIsLoadingDoctors(false);
        }
    }, []);

    useEffect(() => {
        fetchDoctors().catch(console.error);
    }, [fetchDoctors]);

    // Загрузка слотов при выборе врача
    const fetchSlotsForDoctor = useCallback(async (doctorId: number) => {
        if (!doctorId) return;
        setIsLoadingSlots(true);
        setError(null); // Сбрасываем общую ошибку
        setSlots([]); // Очищаем предыдущие слоты
        try {
            // GET /api/schedules/doctor/:id (параметры ?available и ?startDate по умолчанию)
            const response = await apiClient.get<ScheduleSlot[]>(`/schedules/doctor/${doctorId}`);
            // Сортируем полученные слоты
            response.data.sort((a, b) => {
                const dateComparison = a.date.localeCompare(b.date);
                if (dateComparison !== 0) return dateComparison;
                return a.start_time.localeCompare(b.start_time);
            });
            setSlots(response.data);
        } catch (err) {
            console.error(`Ошибка загрузки слотов для врача ${doctorId}:`, err);
            const message = "Не удалось загрузить расписание для выбранного врача.";
            setError(message); // Устанавливаем общую ошибку
            toast.error(message);
        } finally {
            setIsLoadingSlots(false);
        }
    }, []); // useCallback

    useEffect(() => {
        const doctorIdNum = parseInt(selectedDoctorId, 10);
        if (doctorIdNum > 0) {
            fetchSlotsForDoctor(doctorIdNum).catch(console.error);
        } else {
            setSlots([]); // Очищаем, если врач не выбран
        }
    }, [selectedDoctorId, fetchSlotsForDoctor]); // Зависим от ID и функции загрузки


    // --- Удаление Слота (с API) ---
    const handleDeleteClick = (slot: ScheduleSlot) => {
        if (!slot.is_available) { toast.info("Нельзя удалить слот, на который уже есть запись."); return; }
        setDeletingSlot(slot);
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!deletingSlot) return;
        setIsDeleting(true);
        setIsDeleteDialogOpen(false);

        let errorMessage = "Не удалось удалить слот.";

        try {
            // --- Вызов API удаления ---
            await apiClient.delete(`/schedules/${deletingSlot.id}`); // DELETE /api/schedules/:id
            toast.success(`Слот ${deletingSlot.date} ${deletingSlot.start_time} успешно удален.`);
            // Обновляем список слотов для ТЕКУЩЕГО выбранного врача
            const currentDocId = parseInt(selectedDoctorId, 10);
            if (currentDocId > 0) {
                await fetchSlotsForDoctor(currentDocId);
            } else {
                setSlots([]); // На всякий случай очищаем, если врач уже не выбран
            }

        } catch (error) {
            console.error("Ошибка удаления слота (админ):", error);
            if (axios.isAxiosError(error) && error.response) {
                errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
                if (error.response.status === 409) { // Слот занят (бэкенд должен проверить)
                    errorMessage = error.response.data?.error || "Нельзя удалить занятый слот.";
                }
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            toast.error(errorMessage);
        } finally {
            setIsDeleting(false);
            setDeletingSlot(null);
        }
    };


    // Группировка слотов по датам
    const groupedSlots = useMemo(() => {
        return slots.reduce((acc, slot) => { (acc[slot.date] = acc[slot.date] || []).push(slot); return acc; }, {} as Record<string, ScheduleSlot[]>);
    }, [slots]);


    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                <h1 className="text-2xl font-bold">Управление Расписаниями</h1>
                <div className="flex gap-2">
                    <Button variant="outline" asChild> <Link to="/">Назад к панели</Link> </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Выберите врача</CardTitle>
                    <CardDescription>Выберите врача для просмотра и управления его расписанием.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId} disabled={isLoadingDoctors}>
                        <SelectTrigger className="w-full md:w-[300px]">
                            <SelectValue placeholder={isLoadingDoctors ? "Загрузка врачей..." : "Выберите врача..."} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectLabel>Врачи</SelectLabel>
                                {isLoadingDoctors && <SelectItem value="loading" disabled>Загрузка...</SelectItem>}
                                {!isLoadingDoctors && doctors.length === 0 && <SelectItem value="no-doctors" disabled>Врачи не найдены</SelectItem>}
                                {!isLoadingDoctors && doctors.map(doc => (
                                    <SelectItem key={doc.id} value={doc.id.toString()}>
                                        {doc.full_name} (ID: {doc.id})
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    {/* Показываем общую ошибку загрузки, если она была */}
                    {error && !isLoadingSlots && !isLoadingDoctors && <p className="text-sm font-medium text-destructive mt-2">{error}</p>}
                </CardContent>
            </Card>

            {/* Отображение слотов выбранного врача */}
            {selectedDoctorId && (
                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle>Расписание врача: {doctors.find(d=>d.id === parseInt(selectedDoctorId, 10))?.full_name ?? ''}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoadingSlots && <p>Загрузка слотов...</p>}
                        {/* Ошибка загрузки слотов будет показана как общая ошибка выше */}
                        {!isLoadingSlots && slots.length === 0 && <p>Слоты не найдены.</p>}
                        {!isLoadingSlots && slots.length > 0 && (
                            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                                {Object.entries(groupedSlots).map(([date, slotsInDate]) => (
                                    <div key={date}>
                                        <h3 className="font-semibold mb-2 text-lg"> {format(parseISO(date), 'd MMMM<y_bin_46>, EEEE', { locale: ru })} </h3>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {slotsInDate.map((slot) => (
                                                <div key={slot.id} className="flex items-center gap-1">
                                                    <Badge variant={slot.is_available ? 'outline' : 'secondary'}> {slot.start_time} - {slot.end_time} {!slot.is_available ? '(Занят)' : ''} </Badge>
                                                    {slot.is_available && (
                                                        <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteClick(slot)} disabled={isDeleting && deletingSlot?.id === slot.id} aria-label="Удалить слот" >
                                                            {isDeleting && deletingSlot?.id === slot.id ? ( <span className="animate-spin text-xs">...</span> ) : ( <Trash2 className="h-3 w-3" /> )}
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

            {/* Диалог подтверждения удаления слота */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                {/* Контент рендерится только если deletingSlot не null */}
                {deletingSlot && (
                    <AlertDialogContent>
                        <AlertDialogHeader> <AlertDialogTitle>Подтвердить удаление</AlertDialogTitle> <AlertDialogDescription> Вы уверены, что хотите удалить слот <span className="font-semibold"> {deletingSlot?.date} {deletingSlot?.start_time}</span> для врача <span className="font-semibold"> {doctors.find(d=>d.id === deletingSlot?.doctor_id)?.full_name}</span>? </AlertDialogDescription> </AlertDialogHeader>
                        <AlertDialogFooter> <AlertDialogCancel onClick={() => setDeletingSlot(null)}>Отмена</AlertDialogCancel> <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"> {isDeleting ? 'Удаление...' : 'Удалить'} </AlertDialogAction> </AlertDialogFooter>
                    </AlertDialogContent>
                )}
            </AlertDialog>

        </div>
    );
};

export default ManageAllSchedulesPage;