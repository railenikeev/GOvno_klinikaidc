// my-clinic-app/src/pages/MakeAppointmentPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
// WalletCards может быть более подходящей иконкой для "Наличными или картой в клинике"
import { Check, ChevronsUpDown, CreditCard, WalletCards, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Toaster, toast } from "sonner";

// ... (интерфейсы остаются такими же, как в предыдущей версии) ...
interface Doctor {
    id: number;
    full_name: string;
    specialization_name?: string | null;
}

interface ScheduleSlot {
    id: number;
    doctor_id: number;
    date: string;
    start_time: string;
    end_time: string;
    is_available: boolean;
}

interface AppointmentCreationResponse {
    id: number;
    patient_id?: number;
    doctor_schedule_id?: number;
    status?: string;
    created_at?: string;
    date?: string | null;
    start_time?: string | null;
    doctor_name?: string | null;
}

interface PaymentPayload {
    appointment_id: number;
    amount: number;
}

type PaymentMethod = "online" | "cash_or_card_at_clinic";


const MakeAppointmentPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [isLoadingDoctors, setIsLoadingDoctors] = useState<boolean>(true);
    const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);

    const [availableSlots, setAvailableSlots] = useState<ScheduleSlot[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<ScheduleSlot | null>(null);
    const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);

    const [doctorPopoverOpen, setDoctorPopoverOpen] = useState(false);

    const [step, setStep] = useState<"selectSlot" | "selectPayment" | "confirmed">("selectSlot");
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>("cash_or_card_at_clinic");
    const [isProcessing, setIsProcessing] = useState<boolean>(false);

    const MOCK_APPOINTMENT_COST = 1500;

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
        setStep("selectSlot");
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
            setStep("selectSlot");
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
        setStep("selectSlot");
        setDoctorPopoverOpen(false);
    };

    const handleSlotSelect = (slot: ScheduleSlot) => {
        setSelectedSlot(slot);
        setStep("selectSlot");
    };

    const handleProceedToPayment = () => {
        if (!selectedSlot) {
            toast.error("Пожалуйста, выберите время для записи.");
            return;
        }
        setStep("selectPayment");
    };

    const handleFinalBookingAndPayment = async () => {
        if (!selectedSlot || !user || user.role !== 'patient' || !selectedDoctor) {
            toast.error("Произошла ошибка. Пожалуйста, проверьте выбор врача, слота и авторизацию.");
            return;
        }
        setIsProcessing(true);
        let appointmentId: number | null = null;
        let bookingErrorMessage = "Не удалось создать запись на прием.";

        try {
            const appointmentResponse = await apiClient.post<AppointmentCreationResponse>('/appointments', {
                doctor_schedule_id: selectedSlot.id,
            });

            if (!(appointmentResponse.status === 201 && appointmentResponse.data && appointmentResponse.data.id)) {
                throw new Error(appointmentResponse.data?.status || `Неожиданный ответ сервера при создании записи: ${appointmentResponse.status}`);
            }

            appointmentId = appointmentResponse.data.id;
            toast.success(`Запись #${appointmentId} к врачу ${selectedDoctor.full_name} на ${selectedSlot.date} в ${selectedSlot.start_time} создана!`);

            if (selectedPaymentMethod === "online") {
                toast.info("Обработка онлайн платежа...");
                const paymentPayload: PaymentPayload = {
                    appointment_id: appointmentId,
                    amount: MOCK_APPOINTMENT_COST,
                };
                try {
                    await apiClient.post('/payments', paymentPayload);
                    toast.success("Онлайн оплата прошла успешно (имитация).");
                } catch (paymentError) {
                    console.error("Ошибка онлайн оплаты:", paymentError);
                    toast.error("Произошла ошибка при онлайн оплате. Запись создана, но оплата не прошла. Свяжитесь с администратором для уточнения.");
                }
            } else {
                toast.info("Вы выбрали оплату наличными или картой в клинике.");
            }

            setStep("confirmed");
            setSelectedSlot(null);
            if (selectedDoctorId) {
                await fetchSlotsForDoctor(selectedDoctorId);
            }
            setTimeout(() => {
                navigate('/my-appointments');
            }, 3000);

        } catch (error) {
            console.error("Ошибка при бронировании и оплате:", error);
            if (axios.isAxiosError(error) && error.response) {
                if (error.response.status === 409 && !appointmentId) {
                    bookingErrorMessage = error.response.data?.error || "Этот слот уже занят или недоступен. Пожалуйста, выберите другой.";
                    if (selectedDoctorId) await fetchSlotsForDoctor(selectedDoctorId);
                } else {
                    bookingErrorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
                }
            } else if (error instanceof Error) {
                bookingErrorMessage = error.message;
            }
            toast.error(bookingErrorMessage);
            if (!appointmentId) {
                setStep("selectSlot");
            }
        } finally {
            setIsProcessing(false);
        }
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
                                    <Button variant="outline" role="combobox" aria-expanded={doctorPopoverOpen} className="w-full justify-between" disabled={isLoadingDoctors || doctors.length === 0 || isProcessing}>
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
                                            {/* ИСПРАВЛЕНИЕ ЗДЕСЬ: Используем 'PPPP' для полной локализованной даты */}
                                            <h3 className="font-semibold mb-2 text-lg">{format(parseISO(date), 'PPPP', { locale: ru })}</h3>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                                                {slotsOnDate.sort((a,b) => a.start_time.localeCompare(b.start_time)).map((slot) => (
                                                    <Button key={slot.id} variant={selectedSlot?.id === slot.id ? "default" : "outline"} size="sm" onClick={() => handleSlotSelect(slot)} disabled={!slot.is_available || isProcessing || step === "selectPayment"} title={!slot.is_available ? "Слот занят" : `Записаться на ${slot.start_time}`}>
                                                        {slot.start_time}
                                                    </Button>))}
                                            </div>
                                        </div>))}
                                </div>)}
                        </CardContent>
                    </Card>

                    {selectedSlot && step === "selectSlot" && (
                        <div className="mt-6 flex justify-end">
                            <Button size="lg" onClick={handleProceedToPayment} disabled={isProcessing}>
                                Продолжить
                            </Button>
                        </div>
                    )}

                    {step === "selectPayment" && selectedSlot && selectedDoctor &&(
                        <Card className="mt-6 border-primary shadow-lg">
                            <CardHeader>
                                <CardTitle className="text-primary flex items-center">
                                    <CalendarCheck className="mr-2 h-5 w-5"/> 3. Подтверждение и Оплата
                                </CardTitle>
                                <CardDescription>
                                    Вы выбрали запись к врачу <span className="font-semibold">{selectedDoctor.full_name}</span>
                                    <br/>
                                    {/* ИСПРАВЛЕНИЕ ЗДЕСЬ: Используем 'PPPP' */}
                                    Дата: <span className="font-semibold">{selectedSlot.date ? format(parseISO(selectedSlot.date), 'PPPP', { locale: ru }) : ''}</span>
                                    <br/>
                                    Время: <span className="font-semibold">{selectedSlot.start_time}</span>
                                    <br/>
                                    Стоимость приема: <span className="font-semibold">{MOCK_APPOINTMENT_COST} руб.</span>
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <RadioGroup defaultValue="cash_or_card_at_clinic" value={selectedPaymentMethod} onValueChange={(value: string) => setSelectedPaymentMethod(value as PaymentMethod)} className="space-y-3 mb-6">
                                    <Label htmlFor="online" className={cn("flex items-center space-x-3 p-3 rounded-md border hover:bg-accent cursor-pointer", selectedPaymentMethod === 'online' && "border-primary ring-2 ring-primary")}>
                                        <RadioGroupItem value="online" id="online" />
                                        <CreditCard className="h-5 w-5 text-primary" />
                                        <span>Оплатить онлайн (Картой)</span>
                                    </Label>
                                    <Label htmlFor="cash_or_card_at_clinic" className={cn("flex items-center space-x-3 p-3 rounded-md border hover:bg-accent cursor-pointer", selectedPaymentMethod === 'cash_or_card_at_clinic' && "border-primary ring-2 ring-primary")}>
                                        <RadioGroupItem value="cash_or_card_at_clinic" id="cash_or_card_at_clinic" />
                                        {/* Замена иконки Home на WalletCards */}
                                        <WalletCards className="h-5 w-5 text-green-600" />
                                        <span>Наличными или картой в клинике</span>
                                    </Label>
                                </RadioGroup>

                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button size="lg" className="w-full" disabled={isProcessing}>
                                            {isProcessing ? "Обработка..." : "Завершить запись"}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Подтвердить запись?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                {/* ИСПРАВЛЕНИЕ ЗДЕСЬ: Используем 'PPPP' или 'dd.MM.yyyy' */}
                                                Вы уверены, что хотите записаться к врачу <span className="font-semibold">{selectedDoctor?.full_name}</span> на <span className="font-semibold">{selectedSlot.date ? format(parseISO(selectedSlot.date), 'PPPP', { locale: ru }) : ''} в {selectedSlot.start_time}</span>
                                                {selectedPaymentMethod === 'online' ? " с онлайн оплатой?" : " с оплатой наличными или картой в клинике?"}
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel disabled={isProcessing}>Отмена</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleFinalBookingAndPayment} disabled={isProcessing}>
                                                {isProcessing ? "Обработка..." : "Да, подтвердить"}
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </CardContent>
                        </Card>
                    )}
                    {step === "confirmed" && (
                        <Card className="mt-6 border-green-500 shadow-lg">
                            <CardHeader>
                                <CardTitle className="text-green-600 flex items-center"><Check className="mr-2 h-6 w-6"/>Запись успешно оформлена!</CardTitle>
                                <CardDescription>
                                    Информация о вашей записи отправлена. Вы будете перенаправлены на страницу "Мои записи".
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MakeAppointmentPage;