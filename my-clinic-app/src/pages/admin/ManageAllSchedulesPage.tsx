import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO, addDays } from 'date-fns'; // Добавили addDays для mock
import { ru } from 'date-fns/locale';
import { Trash2 } from 'lucide-react'; // Вернули иконку для удаления

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"; // Используем Select для выбора врача
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Toaster, toast } from "sonner";
// import apiClient from '@/services/apiClient'; // Пока не используем реальные вызовы

// --- Типы и Mock Данные ---
interface Doctor {
    id: number;
    full_name: string;
}
const MOCK_DOCTORS_LIST: Doctor[] = [
    { id: 2, full_name: 'Доктор Петров В.А.'},
    { id: 4, full_name: 'Доктор Сидорова Е.П.'},
    { id: 5, full_name: 'Доктор Иванов И.И.'},
];

interface ScheduleSlot {
    id: number;
    doctor_id: number;
    date: string;
    start_time: string;
    end_time: string;
    is_available: boolean;
}
// Та же mock-функция, что и в ManageSchedulePage врача
const generateMockSlots = (doctorId: number): ScheduleSlot[] => {
    if (!doctorId) return [];
    const slots: ScheduleSlot[] = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
        const date = addDays(today, i);
        const dateStr = format(date, 'yyyy-MM-dd');
        if (i % 2 === 0) {
            slots.push({ id: doctorId * 100 + i * 10 + 1, doctor_id: doctorId, date: dateStr, start_time: '09:00', end_time: '09:30', is_available: true });
            slots.push({ id: doctorId * 100 + i * 10 + 2, doctor_id: doctorId, date: dateStr, start_time: '09:30', end_time: '10:00', is_available: true });
            slots.push({ id: doctorId * 100 + i * 10 + 5, doctor_id: doctorId, date: dateStr, start_time: '11:00', end_time: '11:30', is_available: true });
        } else {
            slots.push({ id: doctorId * 100 + i * 10 + 3, doctor_id: doctorId, date: dateStr, start_time: '14:00', end_time: '14:30', is_available: true });
            slots.push({ id: doctorId * 100 + i * 10 + 4, doctor_id: doctorId, date: dateStr, start_time: '14:30', end_time: '15:00', is_available: true });
        }
    }
    if (slots.length > 2) slots[1].is_available = false; // Имитируем занятый слот
    // Имитируем еще один занятый
    if (slots.length > 5) slots[4].is_available = false;
    return slots;
};
// --- Конец Mock Данных ---


const ManageAllSchedulesPage: React.FC = () => {
    const [doctors] = useState<Doctor[]>(MOCK_DOCTORS_LIST);
    const [selectedDoctorId, setSelectedDoctorId] = useState<string>(''); // ID выбранного врача (строка из Select)
    const [slots, setSlots] = useState<ScheduleSlot[]>([]);
    const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
    // Состояния для удаления
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingSlot, setDeletingSlot] = useState<ScheduleSlot | null>(null);
    const [isDeleting, setIsDeleting] = useState<boolean>(false); // Индикатор загрузки для кнопки удаления

    // "Загрузка" слотов при выборе врача (имитация)
    useEffect(() => {
        const doctorIdNum = parseInt(selectedDoctorId, 10);
        if (doctorIdNum > 0) {
            setIsLoadingSlots(true);
            // Имитируем задержку API
            setTimeout(() => {
                const generatedSlots = generateMockSlots(doctorIdNum);
                generatedSlots.sort((a, b) => { // Сортируем сразу
                    const dateComparison = a.date.localeCompare(b.date);
                    if (dateComparison !== 0) return dateComparison;
                    return a.start_time.localeCompare(b.start_time);
                });
                setSlots(generatedSlots);
                setIsLoadingSlots(false);
            }, 300); // Уменьшим задержку
        } else {
            setSlots([]); // Очищаем слоты, если врач не выбран
        }
    }, [selectedDoctorId]);

    // Группировка слотов по датам
    const groupedSlots = useMemo(() => {
        return slots.reduce((acc, slot) => {
            (acc[slot.date] = acc[slot.date] || []).push(slot);
            return acc;
        }, {} as Record<string, ScheduleSlot[]>);
    }, [slots]);

    // Открытие диалога удаления
    const handleDeleteClick = (slot: ScheduleSlot) => {
        if (!slot.is_available) {
            toast.info("Нельзя удалить слот, на который уже есть запись.");
            return;
        }
        setDeletingSlot(slot);
        setIsDeleteDialogOpen(true);
    };

    // Подтверждение удаления (имитация)
    const handleDeleteConfirm = async () => {
        if (!deletingSlot) return;
        setIsDeleting(true);
        setIsDeleteDialogOpen(false); // Закрываем диалог

        try {
            // --- Имитация вызова API ---
            console.log(`Админ имитирует удаление слота ID: ${deletingSlot.id} врача ID: ${deletingSlot.doctor_id}`);
            // Закомментировано до реализации бэкенда:
            // await apiClient.delete(`/schedules/${deletingSlot.id}`); // Админ должен иметь право удалять чужие слоты (проверка на бэке)
            await new Promise(resolve => setTimeout(resolve, 1000));
            // --- Конец имитации ---

            toast.success(`Слот ${deletingSlot.date} ${deletingSlot.start_time} успешно удален.`);
            // Обновляем локальное состояние
            setSlots(prev => prev.filter(s => s.id !== deletingSlot.id));

        } catch (error) {
            console.error("Ошибка удаления слота (админ):", error);
            toast.error("Не удалось удалить слот.");
        } finally {
            setIsDeleting(false);
            setDeletingSlot(null);
        }
    };


    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                <h1 className="text-2xl font-bold">Управление Расписаниями</h1>
                <div className="flex gap-2">
                    {/* TODO: Кнопка "Добавить слот" (для админа?) */}
                    {/* <Button>Добавить слот</Button> */}
                    <Button variant="outline" asChild>
                        <Link to="/">Назад к панели</Link>
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Выберите врача</CardTitle>
                    <CardDescription>Выберите врача из списка, чтобы просмотреть или изменить его расписание.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
                        <SelectTrigger className="w-full md:w-[300px]">
                            <SelectValue placeholder="Выберите врача..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectLabel>Врачи</SelectLabel>
                                {doctors.map(doc => (
                                    <SelectItem key={doc.id} value={doc.id.toString()}>
                                        {doc.full_name} (ID: {doc.id})
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
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
                        {!isLoadingSlots && slots.length === 0 && <p>Для этого врача нет доступных слотов в расписании.</p>}
                        {!isLoadingSlots && slots.length > 0 && (
                            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                                {Object.entries(groupedSlots).map(([date, slotsInDate]) => (
                                    <div key={date}>
                                        <h3 className="font-semibold mb-2 text-lg">
                                            {format(parseISO(date), 'd MMMM<y_bin_46>, EEEE', { locale: ru })}
                                        </h3>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {slotsInDate.map((slot) => (
                                                <div key={slot.id} className="flex items-center gap-1">
                                                    <Badge variant={slot.is_available ? 'outline' : 'secondary'}>
                                                        {slot.start_time} - {slot.end_time} {!slot.is_available ? '(Занят)' : ''}
                                                    </Badge>
                                                    {/* Кнопка удаления доступна АДМИНУ даже для занятых? Нет, только для доступных */}
                                                    {slot.is_available && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                                            onClick={() => handleDeleteClick(slot)}
                                                            disabled={isDeleting && deletingSlot?.id === slot.id}
                                                            aria-label="Удалить слот"
                                                        >
                                                            {isDeleting && deletingSlot?.id === slot.id ? (
                                                                <span className="animate-spin text-xs">...</span>
                                                            ) : (
                                                                <Trash2 className="h-3 w-3" />
                                                            )}
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
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Подтвердить удаление</AlertDialogTitle>
                        <AlertDialogDescription>
                            Вы уверены, что хотите удалить слот
                            <span className="font-semibold"> {deletingSlot?.date} {deletingSlot?.start_time}</span> для врача
                            <span className="font-semibold"> {doctors.find(d=>d.id === deletingSlot?.doctor_id)?.full_name}</span>?
                            Это действие необратимо.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeletingSlot(null)}>Отмена</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            {isDeleting ? 'Удаление...' : 'Удалить'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

        </div>
    );
};

export default ManageAllSchedulesPage;