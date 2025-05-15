// my-clinic-app/src/pages/MakeAppointmentPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react'; // Добавили useCallback
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns'; // Убрали addDays, т.к. оно было для mock
import { ru } from 'date-fns/locale';
import axios from 'axios'; // Оставили для isAxiosError

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"; // Убрали AlertDialogTrigger, т.к. используем asChild
import { Check, ChevronsUpDown, Link } from "lucide-react";
import { cn } from "@/lib/utils";

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext'; // Для проверки, что пользователь авторизован
import { Toaster, toast } from "sonner";

// Тип для врача из API
interface Doctor {
    id: number;
    full_name: string;
    specialization_name?: string | null; // Может быть null
}

// Тип для слота из API (doctor_schedule)
interface ScheduleSlot {
    id: number; // Это doctor_schedule_id
    doctor_id: number;
    date: string; // YYYY-MM-DD
    start_time: string; // HH:MM
    end_time: string; // HH:MM
    is_available: boolean;
}

const MakeAppointmentPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth(); // Получаем текущего пользователя

    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [isLoadingDoctors, setIsLoadingDoctors] = useState<boolean>(true);

    const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
    const [availableSlots, setAvailableSlots] = useState<ScheduleSlot[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<ScheduleSlot | null>(null);

    const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
    const [isBooking, setIsBooking] = useState<boolean>(false);

    const [doctorPopoverOpen, setDoctorPopoverOpen] = useState(false);

    // Загрузка врачей при монтировании компонента
    useEffect(() => {
        const fetchDoctors = async () => {
            setIsLoadingDoctors(true);
            try {
                const response = await apiClient.get<Doctor[]>('/users?role=doctor');
                setDoctors(response.data);
            } catch (error) {
                console.error("Ошибка загрузки врачей:", error);
                toast.error("Не удалось загрузить список врачей.");
            } finally {
                setIsLoadingDoctors(false);
            }
        };
        fetchDoctors();
    }, []);

    // Загрузка слотов при выборе врача
    const fetchSlotsForDoctor = useCallback(async (doctorId: number) => {
        setSelectedSlot(null); // Сбрасываем выбранный слот
        setAvailableSlots([]); // Очищаем предыдущие слоты
        if (!doctorId) return;

        setIsLoadingSlots(true);
        try {
            const today = format(new Date(), 'yyyy-MM-dd');
            // Запрашиваем только доступные слоты, начиная с сегодняшнего дня
            const response = await apiClient.get<ScheduleSlot[]>(`/schedules/doctor/${doctorId}?available=true&startDate=${today}`);
            // Бэкенд уже должен сортировать, но на всякий случай можем отсортировать и здесь
            response.data.sort((a, b) => {
                const dateComparison = a.date.localeCompare(b.date);
                if (dateComparison !== 0) return dateComparison;
                return a.start_time.localeCompare(b.start_time);
            });
            setAvailableSlots(response.data);
        } catch (error) {
            console.error(`Ошибка загрузки слотов для врача ${doctorId}:`, error);
            toast.error("Не удалось загрузить расписание для выбранного врача.");
        } finally {
            setIsLoadingSlots(false);
        }
    }, []); // useCallback

    useEffect(() => {
        if (selectedDoctorId) {
            fetchSlotsForDoctor(selectedDoctorId);
        } else {
            setAvailableSlots([]);
            setSelectedSlot(null);
        }
    }, [selectedDoctorId, fetchSlotsForDoctor]);


    const groupedSlots = useMemo(() => {
        return availableSlots.reduce((acc, slot) => {
            (acc[slot.date] = acc[slot.date] || []).push(slot);
            return acc;
        }, {} as Record<string, ScheduleSlot[]>);
    }, [availableSlots]);

    const handleDoctorSelect = (doctorIdStr: string) => {
        const id = parseInt(doctorIdStr, 10);
        setSelectedDoctorId(id);
        setDoctorPopoverOpen(false); // Закрываем popover после выбора
    };

    const handleSlotSelect = (slot: ScheduleSlot) => {
        setSelectedSlot(slot);
    };

    const handleBookingConfirm = async () => {
        if (!selectedSlot || !user) { // Проверяем и пользователя
            toast.error("Сначала выберите врача и доступный слот.");
            return;
        }
        if (user.role !== 'patient') { // Дополнительная проверка, хотя страница должна быть защищена роутером
            toast.error("Только пациенты могут записываться на прием.");
            return;
        }

        setIsBooking(true);
        let errorMessage = "Не удалось записаться на прием.";

        try {
            const response = await apiClient.post('/appointments', {
                doctor_schedule_id: selectedSlot.id, // `id` слота - это `doctor_schedule_id`
            });

            if (response.status === 201 && response.data) {
                toast.success(`Вы успешно записаны на ${selectedSlot.date} в ${selectedSlot.start_time}!`);
                // Очищаем выбор и перезагружаем слоты, т.к. один из них теперь занят
                setSelectedSlot(null);
                if (selectedDoctorId) {
                    await fetchSlotsForDoctor(selectedDoctorId); // Обновляем список слотов
                }
                setTimeout(() => navigate('/my-appointments'), 2000); // Переход на страницу "Мои записи"
                return;
            } else {
                errorMessage = `Неожиданный ответ сервера: ${response.status}`;
            }
        } catch (error) {
            console.error("Ошибка записи на прием:", error);
            if (axios.isAxiosError(error) && error.response) {
                if (error.response.status === 409) { // Conflict
                    errorMessage = error.response.data?.error || "Этот слот уже занят или недоступен. Пожалуйста, выберите другой.";
                    // Обновляем слоты, чтобы убрать занятый
                    if (selectedDoctorId) {
                        await fetchSlotsForDoctor(selectedDoctorId);
                    }
                } else {
                    errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
                }
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
        } finally {
            setIsBooking(false);
        }
        toast.error(errorMessage);
    };

    const selectedDoctor = doctors.find(doc => doc.id === selectedDoctorId);

    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Запись на прием</h1>
                <Button variant="outline" asChild>
                    <Link to="/">Назад к панели</Link>
                </Button>
            </div>


            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* --- Колонка выбора врача --- */}
                <div className="md:col-span-1">
                    <Card>
                        <CardHeader>
                            <CardTitle>1. Выберите врача</CardTitle>
                            {isLoadingDoctors && <CardDescription>Загрузка врачей...</CardDescription>}
                        </CardHeader>
                        <CardContent>
                            <Popover open={doctorPopoverOpen} onOpenChange={setDoctorPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={doctorPopoverOpen}
                                        className="w-full justify-between"
                                        disabled={isLoadingDoctors || doctors.length === 0}
                                    >
                                        {selectedDoctor
                                            ? `${selectedDoctor.full_name} (${selectedDoctor.specialization_name || 'Общий'})`
                                            : isLoadingDoctors ? "Загрузка..." : (doctors.length === 0 ? "Нет доступных врачей" : "Выберите врача...")}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] max-h-[--radix-popover-content-available-height] p-0">
                                    <Command>
                                        <CommandInput placeholder="Поиск врача..." />
                                        <CommandList>
                                            <CommandEmpty>Врач не найден.</CommandEmpty>
                                            <CommandGroup>
                                                {doctors.map((doctor) => (
                                                    <CommandItem
                                                        key={doctor.id}
                                                        value={doctor.full_name} // Используем имя для поиска в CommandInput
                                                        onSelect={() => handleDoctorSelect(doctor.id.toString())}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                selectedDoctorId === doctor.id ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        {doctor.full_name} ({doctor.specialization_name || 'Общая практика'})
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </CardContent>
                    </Card>
                </div>

                {/* --- Колонка выбора слота --- */}
                <div className="md:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>2. Выберите дату и время</CardTitle>
                            {!selectedDoctorId && <CardDescription>Сначала выберите врача</CardDescription>}
                            {selectedDoctor && <CardDescription>Доступное время для: <span className="font-semibold">{selectedDoctor.full_name}</span></CardDescription>}
                        </CardHeader>
                        <CardContent className="min-h-[200px]"> {/* Добавил min-h для предотвращения "прыжков" */}
                            {isLoadingSlots && <p>Загрузка доступных слотов...</p>}
                            {!isLoadingSlots && selectedDoctorId && availableSlots.length === 0 && (
                                <p>Нет доступных слотов для выбранного врача на ближайшее время.</p>
                            )}
                            {!isLoadingSlots && Object.keys(groupedSlots).length > 0 && (
                                <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                                    {Object.entries(groupedSlots)
                                        .sort(([dateA], [dateB]) => dateA.localeCompare(dateB)) // Сортируем даты
                                        .map(([date, slotsOnDate]) => (
                                            <div key={date}>
                                                <h3 className="font-semibold mb-2 text-lg">
                                                    {format(parseISO(date), 'd MMMM yyyy, EEEE', { locale: ru })}
                                                </h3>
                                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                                                    {slotsOnDate
                                                        .sort((a,b) => a.start_time.localeCompare(b.start_time)) // Сортируем время
                                                        .map((slot) => (
                                                            <Button
                                                                key={slot.id}
                                                                variant={selectedSlot?.id === slot.id ? "default" : "outline"}
                                                                size="sm"
                                                                onClick={() => handleSlotSelect(slot)}
                                                                disabled={!slot.is_available || isBooking} // Блокируем если слот не доступен или идет бронирование
                                                                title={!slot.is_available ? "Слот занят" : `Записаться на ${slot.start_time}`}
                                                            >
                                                                {slot.start_time}
                                                            </Button>
                                                        ))}
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* --- Кнопка подтверждения --- */}
                    {selectedSlot && (
                        <div className="mt-6 flex justify-end">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button size="lg" disabled={isBooking || !selectedSlot.is_available}>
                                        {isBooking ? "Запись..." : `Записаться на ${selectedSlot.start_time}`}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Подтверждение записи</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Вы уверены, что хотите записаться к врачу
                                            <span className="font-semibold"> {selectedDoctor?.full_name}</span> на
                                            <span className="font-semibold"> {selectedSlot.date ? format(parseISO(selectedSlot.date), 'dd.MM.yyyy', { locale: ru }) : ''} в {selectedSlot.start_time}</span>?
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel disabled={isBooking}>Отмена</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleBookingConfirm} disabled={isBooking}>
                                            {isBooking ? "Обработка..." : "Подтвердить"}
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MakeAppointmentPage;