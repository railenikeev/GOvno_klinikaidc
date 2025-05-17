// my-clinic-app/src/pages/MakeAppointmentPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import axios from 'axios';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"; // Добавили RadioGroup
import { Label } from "@/components/ui/label"; // Добавили Label
import { Check, ChevronsUpDown, CreditCard, Home } from "lucide-react"; // Добавили иконки для оплаты
import { cn } from "@/lib/utils";

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Toaster, toast } from "sonner";

// Тип для врача из API
interface Doctor {
    id: number;
    full_name: string;
    specialization_name?: string | null;
}

// Тип для слота из API (doctor_schedule)
interface ScheduleSlot {
    id: number; // Это doctor_schedule_id
    doctor_id: number;
    date: string;
    start_time: string;
    end_time: string;
    is_available: boolean;
}

// Тип для ответа при создании записи
interface AppointmentCreationResponse {
    id: number; // ID созданной записи
    // ... другие поля, если бэкенд их возвращает, но нам важен ID
}

// Тип для создания платежа
interface PaymentPayload {
    appointment_id: number;
    amount: number;
    // payment_status будет 'paid' или 'pending' на бэкенде
}

type PaymentMethod = "online" | "cash";

const MakeAppointmentPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [isLoadingDoctors, setIsLoadingDoctors] = useState<boolean>(true);
    const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);

    const [availableSlots, setAvailableSlots] = useState<ScheduleSlot[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<ScheduleSlot | null>(null);
    const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);

    const [isBooking, setIsBooking] = useState<boolean>(false);
    const [doctorPopoverOpen, setDoctorPopoverOpen] = useState(false);

    const [showPaymentOptions, setShowPaymentOptions] = useState<boolean>(false);
    const [createdAppointmentId, setCreatedAppointmentId] = useState<number | null>(null);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>("cash");
    const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);

    const MOCK_APPOINTMENT_COST = 1500; // Примерная стоимость приема для онлайн-оплаты

    useEffect(() => {
        const fetchDoctors = async () => {
            setIsLoadingDoctors(true);
            try {
                const response = await apiClient.get<Doctor[]>('/users?role=doctor');
                setDoctors(response.data || []);
            } catch (error) {
                console.error("Ошибка загрузки врачей:", error);
                toast.error("Не удалось загрузить список врачей.");
            } finally {
                setIsLoadingDoctors(false);
            }
        };
        fetchDoctors();
    }, []);

    const fetchSlotsForDoctor = useCallback(async (doctorId: number) => {
        setSelectedSlot(null);
        setAvailableSlots([]);
        if (!doctorId) return;
        setIsLoadingSlots(true);
        try {
            const today = format(new Date(), 'yyyy-MM-dd');
            const response = await apiClient.get<ScheduleSlot[]>(`/schedules/doctor/${doctorId}?available=true&startDate=${today}`);
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
    }, []);

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
        setShowPaymentOptions(false); // Сбрасываем опции оплаты при смене врача
        setDoctorPopoverOpen(false);
    };

    const handleSlotSelect = (slot: ScheduleSlot) => {
        setSelectedSlot(slot);
        setShowPaymentOptions(false); // Сбрасываем опции оплаты при смене слота
    };

    const handleBookingConfirm = async () => {
        if (!selectedSlot || !user || user.role !== 'patient') {
            toast.error("Сначала выберите врача и доступный слот, и убедитесь, что вы авторизованы как пациент.");
            return;
        }
        setIsBooking(true);
        let errorMessage = "Не удалось записаться на прием.";
        try {
            const response = await apiClient.post<AppointmentCreationResponse>('/appointments', {
                doctor_schedule_id: selectedSlot.id,
            });

            if (response.status === 201 && response.data && response.data.id) {
                setCreatedAppointmentId(response.data.id);
                setShowPaymentOptions(true); // Показываем выбор оплаты
                toast.success(`Запись на ${selectedSlot.date} в ${selectedSlot.start_time} создана! Теперь выберите способ оплаты.`);
                // Не перенаправляем сразу, даем выбрать способ оплаты
            } else {
                errorMessage = `Неожиданный ответ сервера: ${response.status}`;
                toast.error(errorMessage);
            }
        } catch (error) {
            console.error("Ошибка записи на прием:", error);
            if (axios.isAxiosError(error) && error.response) {
                if (error.response.status === 409) {
                    errorMessage = error.response.data?.error || "Этот слот уже занят или недоступен. Пожалуйста, выберите другой.";
                    if (selectedDoctorId) await fetchSlotsForDoctor(selectedDoctorId);
                } else {
                    errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
                }
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            toast.error(errorMessage);
        } finally {
            setIsBooking(false);
        }
    };

    const handlePaymentProcess = async () => {
        if (!createdAppointmentId || !selectedSlot) {
            toast.error("Ошибка: отсутствует информация о записи для оплаты.");
            return;
        }
        setIsProcessingPayment(true);

        if (selectedPaymentMethod === "online") {
            const paymentPayload: PaymentPayload = {
                appointment_id: createdAppointmentId,
                amount: MOCK_APPOINTMENT_COST, // Используем моковую стоимость
            };
            try {
                await apiClient.post('/payments', paymentPayload);
                toast.success("Оплата онлайн прошла успешно (имитация). Запись подтверждена!");
            } catch (paymentError) {
                console.error("Ошибка онлайн оплаты:", paymentError);
                toast.error("Произошла ошибка при онлайн оплате. Запись создана, но оплата не прошла. Свяжитесь с администратором.");
                // Запись уже создана, так что просто сообщаем об ошибке оплаты
            }
        } else { // Оплата на месте
            toast.info("Вы выбрали оплату на месте. Запись подтверждена!");
        }

        // В любом случае (успешная онлайн оплата или оплата на месте) перенаправляем
        setSelectedSlot(null);
        setShowPaymentOptions(false);
        setCreatedAppointmentId(null);
        if (selectedDoctorId) {
            await fetchSlotsForDoctor(selectedDoctorId); // Обновляем список слотов
        }
        setTimeout(() => navigate('/my-appointments'), 2500);
        setIsProcessingPayment(false);
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
                <div className="md:col-span-1">
                    <Card>
                        <CardHeader>
                            <CardTitle>1. Выберите врача</CardTitle>
                            {isLoadingDoctors && <CardDescription>Загрузка врачей...</CardDescription>}
                        </CardHeader>
                        <CardContent>
                            <Popover open={doctorPopoverOpen} onOpenChange={setDoctorPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" role="combobox" aria-expanded={doctorPopoverOpen} className="w-full justify-between" disabled={isLoadingDoctors || doctors.length === 0}>
                                        {selectedDoctor ? `${selectedDoctor.full_name} (${selectedDoctor.specialization_name || 'Общий'})` : isLoadingDoctors ? "Загрузка..." : (doctors.length === 0 ? "Нет доступных врачей" : "Выберите врача...")}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] max-h-[--radix-popover-content-available-height] p-0">
                                    <Command><CommandInput placeholder="Поиск врача..." /><CommandList><CommandEmpty>Врач не найден.</CommandEmpty><CommandGroup>
                                        {doctors.map((doctor) => (
                                            <CommandItem key={doctor.id} value={doctor.full_name} onSelect={() => handleDoctorSelect(doctor.id.toString())}>
                                                <Check className={cn("mr-2 h-4 w-4", selectedDoctorId === doctor.id ? "opacity-100" : "opacity-0")} />
                                                {doctor.full_name} ({doctor.specialization_name || 'Общая практика'})
                                            </CommandItem>))}
                                    </CommandGroup></CommandList></Command>
                                </PopoverContent>
                            </Popover>
                        </CardContent>
                    </Card>
                </div>

                <div className="md:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>2. Выберите дату и время</CardTitle>
                            {!selectedDoctorId && <CardDescription>Сначала выберите врача</CardDescription>}
                            {selectedDoctor && <CardDescription>Доступное время для: <span className="font-semibold">{selectedDoctor.full_name}</span></CardDescription>}
                        </CardHeader>
                        <CardContent className="min-h-[200px]">
                            {isLoadingSlots && <p>Загрузка доступных слотов...</p>}
                            {!isLoadingSlots && selectedDoctorId && availableSlots.length === 0 && (<p>Нет доступных слотов для выбранного врача на ближайшее время.</p>)}
                            {!isLoadingSlots && Object.keys(groupedSlots).length > 0 && (
                                <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                                    {Object.entries(groupedSlots).sort(([dateA], [dateB]) => dateA.localeCompare(dateB)).map(([date, slotsOnDate]) => (
                                        <div key={date}>
                                            <h3 className="font-semibold mb-2 text-lg">{format(parseISO(date), 'd MMMM yyyy, EEEE', { locale: ru })}</h3>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                                                {slotsOnDate.sort((a,b) => a.start_time.localeCompare(b.start_time)).map((slot) => (
                                                    <Button key={slot.id} variant={selectedSlot?.id === slot.id ? "default" : "outline"} size="sm" onClick={() => handleSlotSelect(slot)} disabled={!slot.is_available || isBooking} title={!slot.is_available ? "Слот занят" : `Записаться на ${slot.start_time}`}>
                                                        {slot.start_time}
                                                    </Button>))}
                                            </div>
                                        </div>))}
                                </div>)}
                        </CardContent>
                    </Card>

                    {selectedSlot && !showPaymentOptions && (
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
                                            Вы уверены, что хотите записаться к врачу <span className="font-semibold">{selectedDoctor?.full_name}</span> на <span className="font-semibold">{selectedSlot.date ? format(parseISO(selectedSlot.date), 'dd.MM.yyyy', { locale: ru }) : ''} в {selectedSlot.start_time}</span>?
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel disabled={isBooking}>Отмена</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleBookingConfirm} disabled={isBooking}>
                                            {isBooking ? "Обработка..." : "Подтвердить и перейти к оплате"}
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    )}

                    {showPaymentOptions && selectedSlot && createdAppointmentId && (
                        <Card className="mt-6">
                            <CardHeader>
                                <CardTitle>3. Выберите способ оплаты</CardTitle>
                                <CardDescription>
                                    Запись к врачу <span className="font-semibold">{selectedDoctor?.full_name}</span> на <span className="font-semibold">{selectedSlot.date ? format(parseISO(selectedSlot.date), 'dd.MM.yyyy', { locale: ru }) : ''} в {selectedSlot.start_time}</span> создана.
                                    Примерная стоимость приема: {MOCK_APPOINTMENT_COST} руб.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <RadioGroup defaultValue="cash" value={selectedPaymentMethod} onValueChange={(value: PaymentMethod) => setSelectedPaymentMethod(value)} className="space-y-3 mb-4">
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="online" id="online" />
                                        <Label htmlFor="online" className="flex items-center cursor-pointer">
                                            <CreditCard className="mr-2 h-5 w-5 text-primary" /> Оплатить онлайн (Картой)
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="cash" id="cash" />
                                        <Label htmlFor="cash" className="flex items-center cursor-pointer">
                                            <Home className="mr-2 h-5 w-5 text-green-600" /> Оплатить на месте (в клинике)
                                        </Label>
                                    </div>
                                </RadioGroup>
                                <Button size="lg" onClick={handlePaymentProcess} disabled={isProcessingPayment} className="w-full">
                                    {isProcessingPayment ? "Обработка..." : "Завершить запись"}
                                </Button>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MakeAppointmentPage;