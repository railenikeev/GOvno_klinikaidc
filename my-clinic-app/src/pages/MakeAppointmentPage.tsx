import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, addDays, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import axios from 'axios'; // Убрали импорт AxiosError

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils"; // Удалили комментарий

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Toaster, toast } from "sonner";

// --- Mock Данные ---
interface MockDoctor {
    id: number;
    full_name: string;
    specialization_name: string;
}
const MOCK_DOCTORS: MockDoctor[] = [
    { id: 2, full_name: 'Доктор Петров В.А.', specialization_name: 'Терапевт' },
    { id: 4, full_name: 'Доктор Сидорова Е.П.', specialization_name: 'Кардиолог' },
    { id: 5, full_name: 'Доктор Иванов И.И.', specialization_name: 'Невролог' },
];

interface MockSlot {
    id: number; // doctor_schedule_id
    date: string; // YYYY-MM-DD
    start_time: string; // HH:MM
    end_time: string; // HH:MM
    is_available: boolean;
}
const generateMockSlots = (doctorId: number): MockSlot[] => {
    if (!doctorId) return [];
    const slots: MockSlot[] = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
        const date = addDays(today, i);
        const dateStr = format(date, 'yyyy-MM-dd');
        if (i % 2 === 0) {
            slots.push({ id: doctorId * 100 + i * 10 + 1, date: dateStr, start_time: '09:00', end_time: '09:30', is_available: true });
            slots.push({ id: doctorId * 100 + i * 10 + 2, date: dateStr, start_time: '09:30', end_time: '10:00', is_available: true });
            slots.push({ id: doctorId * 100 + i * 10 + 5, date: dateStr, start_time: '11:00', end_time: '11:30', is_available: true });
        } else {
            slots.push({ id: doctorId * 100 + i * 10 + 3, date: dateStr, start_time: '14:00', end_time: '14:30', is_available: true });
            slots.push({ id: doctorId * 100 + i * 10 + 4, date: dateStr, start_time: '14:30', end_time: '15:00', is_available: true });
        }
    }
    if (slots.length > 2) slots[1].is_available = false;
    return slots;
};
// --- Конец Mock Данных ---


const MakeAppointmentPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [doctors] = useState<MockDoctor[]>(MOCK_DOCTORS);
    const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
    const [availableSlots, setAvailableSlots] = useState<MockSlot[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<MockSlot | null>(null);
    const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
    const [isBooking, setIsBooking] = useState<boolean>(false);
    const [popoverOpen, setPopoverOpen] = useState(false);


    useEffect(() => {
        if (selectedDoctorId) {
            setIsLoadingSlots(true);
            setTimeout(() => {
                const slots = generateMockSlots(selectedDoctorId).filter(slot => slot.is_available);
                setAvailableSlots(slots);
                setSelectedSlot(null);
                setIsLoadingSlots(false);
            }, 500);
        } else {
            setAvailableSlots([]);
            setSelectedSlot(null);
        }
    }, [selectedDoctorId]);

    const groupedSlots = useMemo(() => {
        return availableSlots.reduce((acc, slot) => {
            (acc[slot.date] = acc[slot.date] || []).push(slot);
            return acc;
        }, {} as Record<string, MockSlot[]>);
    }, [availableSlots]);

    const handleDoctorSelect = (doctorId: string) => {
        const id = parseInt(doctorId, 10);
        setSelectedDoctorId(id);
        setPopoverOpen(false);
    };

    const handleSlotSelect = (slot: MockSlot) => {
        setSelectedSlot(slot);
    };

    const handleBookingConfirm = async () => {
        if (!selectedSlot || !user) {
            toast.error("Сначала выберите врача и доступный слот.");
            return;
        }
        setIsBooking(true);
        let errorMessage = "Не удалось записаться на прием."; // Сообщение по умолчанию

        try {
            const response = await apiClient.post('/appointments', {
                doctor_schedule_id: selectedSlot.id,
            });

            if (response.status === 201) {
                toast.success(`Вы успешно записаны на ${selectedSlot.date} в ${selectedSlot.start_time}!`);
                setTimeout(() => navigate('/'), 2000);
                return; // Выходим из функции после успешной обработки
            } else {
                // Неожиданный успешный ответ
                errorMessage = `Неожиданный ответ сервера: ${response.status}`;
                // Ошибка будет показана ниже
            }
        } catch (error) {
            // Удалены console.error отсюда
            if (axios.isAxiosError(error) && error.response) {
                if (error.response.status === 409) {
                    errorMessage = error.response.data?.error || "Этот слот уже занят или недоступен.";
                } else {
                    errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
                }
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            // Неизвестная ошибка будет использовать сообщение по умолчанию
        } finally {
            setIsBooking(false);
        }

        // Установка и показ ошибки (если она произошла в try или catch и не было return)
        toast.error(errorMessage);
    };


    const selectedDoctor = doctors.find(doc => doc.id === selectedDoctorId);

    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <h1 className="text-2xl font-bold mb-6">Запись на прием</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* --- Колонка выбора врача --- */}
                <div className="md:col-span-1">
                    <Card>
                        <CardHeader>
                            <CardTitle>1. Выберите врача</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={popoverOpen}
                                        className="w-full justify-between"
                                    >
                                        {selectedDoctor
                                            ? `${selectedDoctor.full_name} (${selectedDoctor.specialization_name})`
                                            : "Выберите врача..."}
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
                                                        value={doctor.full_name}
                                                        onSelect={() => handleDoctorSelect(doctor.id.toString())}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                selectedDoctorId === doctor.id ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        {doctor.full_name} ({doctor.specialization_name})
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
                            {selectedDoctor && <CardDescription>Доступное время для: {selectedDoctor.full_name}</CardDescription>}
                        </CardHeader>
                        <CardContent>
                            {isLoadingSlots && <p>Загрузка слотов...</p>}
                            {!isLoadingSlots && selectedDoctorId && Object.keys(groupedSlots).length === 0 && <p>Нет доступных слотов для выбранного врача.</p>}
                            {!isLoadingSlots && Object.keys(groupedSlots).length > 0 && (
                                <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                                    {Object.entries(groupedSlots).sort(([dateA], [dateB]) => dateA.localeCompare(dateB)).map(([date, slots]) => (
                                        <div key={date}>
                                            <h3 className="font-semibold mb-2 text-lg">
                                                {format(parseISO(date), 'd MMMMPRIMATEC, EEEE', { locale: ru })}
                                            </h3>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                                                {slots.sort((a,b) => a.start_time.localeCompare(b.start_time)).map((slot) => (
                                                    <Button
                                                        key={slot.id}
                                                        variant={selectedSlot?.id === slot.id ? "default" : "outline"}
                                                        size="sm"
                                                        onClick={() => handleSlotSelect(slot)}
                                                        disabled={!slot.is_available}
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
                                    <Button size="lg" disabled={isBooking}>
                                        {isBooking ? "Запись..." : `Записаться на ${selectedSlot.date} ${selectedSlot.start_time}`}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Подтверждение записи</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Вы уверены, что хотите записаться к врачу
                                            <span className="font-semibold"> {selectedDoctor?.full_name}</span> на
                                            <span className="font-semibold"> {selectedSlot.date} в {selectedSlot.start_time}</span>?
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