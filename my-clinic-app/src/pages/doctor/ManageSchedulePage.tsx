// my-clinic-app/src/pages/doctor/ManageSchedulePage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format, parse, isValid, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import axios from 'axios';

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Toaster, toast } from "sonner";
import { cn } from "@/lib/utils";

interface ScheduleSlot {
    id: number;
    doctor_id: number;
    date: string;
    start_time: string;
    end_time: string;
    is_available: boolean;
}

const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
const addSlotSchema = z.object({
    date: z.date({ required_error: "Выберите дату." }),
    startTime: z.string().regex(timeRegex, { message: "Формат ЧЧ:ММ" }),
    endTime: z.string().regex(timeRegex, { message: "Формат ЧЧ:ММ" }),
}).refine(data => {
    if (!data.startTime || !data.endTime) return false;
    const start = parse(data.startTime, 'HH:mm', new Date());
    const end = parse(data.endTime, 'HH:mm', new Date());
    return isValid(start) && isValid(end) && end > start;
}, { message: "Время окончания должно быть позже времени начала", path: ["endTime"], });

type AddSlotFormValues = z.infer<typeof addSlotSchema>;

const ManageSchedulePage: React.FC = () => {
    const { user, isLoading: authIsLoading } = useAuth(); // Получаем isLoading из AuthContext и переименовываем

    const [mySlots, setMySlots] = useState<ScheduleSlot[]>([]);
    const [pageIsLoading, setPageIsLoading] = useState<boolean>(true); // Локальное состояние загрузки для страницы
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState<boolean>(false); // Для блокировки во время операций добавления/удаления
    const [slotToDelete, setSlotToDelete] = useState<ScheduleSlot | null>(null);
    const [isAlertOpen, setIsAlertOpen] = useState(false);

    const form = useForm<AddSlotFormValues>({
        resolver: zodResolver(addSlotSchema),
        defaultValues: { date: undefined, startTime: '', endTime: '' }
    });

    const fetchMySlots = useCallback(async () => {
        setPageIsLoading(true); // Используем локальное состояние
        setError(null);
        try {
            const response = await apiClient.get<ScheduleSlot[]>('/schedules/my');
            if (response.data === null) { // Явная проверка на null
                console.warn("API /schedules/my вернул null вместо массива. Устанавливаем пустой массив.");
                setMySlots([]);
            } else {
                response.data.sort((a, b) => {
                    const dateComparison = a.date.localeCompare(b.date);
                    if (dateComparison !== 0) return dateComparison;
                    return a.start_time.localeCompare(b.start_time);
                });
                setMySlots(response.data || []); // Гарантируем массив
            }
        } catch (err: any) {
            console.error("Ошибка загрузки расписания:", err);
            let errorMessage = "Не удалось загрузить ваше расписание.";
            if (axios.isAxiosError(err) && err.response) {
                if (err.response.status === 401 || err.response.status === 403) {
                    errorMessage = "Доступ запрещен или сессия истекла.";
                } else if (err.response.status === 404) {
                    errorMessage = "Не удалось найти ресурс расписания (ошибка 404)."
                }
                else {
                    errorMessage = err.response.data?.error || `Ошибка сервера (${err.response.status})`;
                }
            } else if (err instanceof Error) {
                // Проверяем на TypeError из-за response.data is null
                if (err.message.includes("response.data is null") || err.message.includes("null")) {
                    errorMessage = "Получен некорректный ответ от сервера (null).";
                } else {
                    errorMessage = err.message;
                }
            }
            setError(errorMessage);
            toast.error(errorMessage);
            setMySlots([]);
        } finally {
            setPageIsLoading(false); // Используем локальное состояние
        }
    }, []); // Оставляем пустым, т.к. user не используется напрямую

    useEffect(() => {
        console.log("[ManageSchedulePage] useEffect triggered. User:", user, "Auth isLoading:", authIsLoading);
        if (authIsLoading) { // Если AuthContext еще грузится, ждем
            setPageIsLoading(true); // Показываем общую загрузку страницы
            return;
        }
        // AuthContext загружен
        if (user && user.role === 'doctor') {
            fetchMySlots(); // Загружаем слоты
        } else if (!user) {
            setError("Необходимо авторизоваться как врач для доступа к этой странице.");
            setPageIsLoading(false);
            setMySlots([]);
        } else { // user.role !== 'doctor'
            setError("Доступ к управлению расписанием только для врачей.");
            setPageIsLoading(false);
            setMySlots([]);
        }
    }, [user, authIsLoading, fetchMySlots]); // Теперь зависим и от authIsLoading

    const onAddSlotSubmit = async (data: AddSlotFormValues) => {
        // ... (код onAddSlotSubmit остается таким же, как в вашем последнем предоставленном варианте)
        // Убедитесь, что setIsProcessing используется правильно
        setIsProcessing(true);
        const payload = {
            date: format(data.date, 'yyyy-MM-dd'),
            start_time: data.startTime,
            end_time: data.endTime,
        };
        let errorMessage = "Не удалось добавить слот.";
        try {
            const response = await apiClient.post<ScheduleSlot>('/schedules', payload);
            if (response.status === 201 && response.data) {
                toast.success(`Слот на ${response.data.date} ${response.data.start_time} добавлен!`);
                form.reset({ date: undefined, startTime: '', endTime: '' });
                await fetchMySlots();
            } else {
                console.error("Ошибка добавления слота: Неожиданный ответ сервера", response);
                errorMessage = `Неожиданный ответ сервера: ${response.status}`;
                toast.error(errorMessage);
            }
        } catch (error: any) {
            if (axios.isAxiosError(error) && error.response) {
                if (error.response.status === 409) {
                    errorMessage = error.response.data?.error || "Такой слот уже существует или пересекается.";
                } else if (error.response.status === 400) {
                    errorMessage = error.response.data?.error || "Неверные данные слота.";
                } else {
                    errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
                }
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            toast.error(errorMessage);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteClick = (slot: ScheduleSlot) => {
        // ... (код handleDeleteClick остается таким же)
        if (!slot.is_available) {
            toast.info("Нельзя удалить слот, на который уже есть запись или он недоступен.");
            return;
        }
        setSlotToDelete(slot);
        setIsAlertOpen(true);
    };

    const handleDeleteConfirm = async () => {
        // ... (код handleDeleteConfirm остается таким же, как в вашем последнем предоставленном варианте)
        // Убедитесь, что setIsProcessing используется правильно
        if (!slotToDelete) return;
        setIsProcessing(true);
        setIsAlertOpen(false);
        let errorMessage = "Не удалось удалить слот.";
        try {
            const response = await apiClient.delete(`/schedules/${slotToDelete.id}`);
            if (response.status === 204) {
                toast.success(`Слот ${slotToDelete.date} ${slotToDelete.start_time} успешно удален.`);
                await fetchMySlots();
            } else {
                console.warn("Неожиданный ответ при удалении слота:", response);
                errorMessage = `Неожиданный ответ сервера: ${response.status}`;
                toast.error(errorMessage);
            }
        } catch (error: any) {
            console.error("Ошибка удаления слота:", error);
            if (axios.isAxiosError(error) && error.response) {
                if (error.response.status === 409) {
                    errorMessage = error.response.data?.error || "Нельзя удалить занятый слот.";
                } else if (error.response.status === 404) {
                    errorMessage = error.response.data?.error || "Слот не найден.";
                } else if (error.response.status === 403) {
                    errorMessage = error.response.data?.error || "Доступ запрещен.";
                } else {
                    errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
                }
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            toast.error(errorMessage);
        } finally {
            setIsProcessing(false);
            setSlotToDelete(null);
        }
    };

    const groupedExistingSlots = useMemo(() => {
        // ... (код groupedExistingSlots остается таким же)
        return mySlots.reduce((acc, slot) => {
            (acc[slot.date] = acc[slot.date] || []).push(slot);
            return acc;
        }, {} as Record<string, ScheduleSlot[]>);
    }, [mySlots]);

    // Управляем главным состоянием загрузки/ошибки
    if (authIsLoading || (pageIsLoading && mySlots.length === 0 && !error)) {
        return <div className="container mx-auto p-4">Загрузка расписания...</div>;
    }

    if (error && mySlots.length === 0) { // Если есть ошибка и слоты не загружены
        return (
            <div className="container mx-auto p-4">
                <p className="text-red-500">{error}</p>
                <Button variant="outline" asChild className="mt-4">
                    <Link to="/">Назад к панели</Link>
                </Button>
            </div>
        );
    }
    // Если пользователь не врач, но AuthContext загружен (ошибка уже установлена в useEffect)
    if (!authIsLoading && (!user || user.role !== 'doctor') && error) {
        return (
            <div className="container mx-auto p-4">
                <p className="text-red-500">{error}</p>
                <Button variant="outline" asChild className="mt-4">
                    <Link to="/">Назад к панели</Link>
                </Button>
            </div>
        );
    }


    // Код JSX return остается таким же, как в вашем последнем предоставленном варианте
    // Убедитесь, что все disabled={isProcessing} на месте
    return (
        <div className="container mx-auto p-4">
            {/* ... (Toaster, заголовок, кнопки) ... */}
            <Toaster position="top-center" richColors closeButton />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Управление моим расписанием</h1>
                <Button variant="outline" asChild>
                    <Link to="/">Назад к панели</Link>
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1">
                    <Card>
                        <CardHeader><CardTitle>Добавить новый слот</CardTitle></CardHeader>
                        <CardContent>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onAddSlotSubmit)} className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="date"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel>Дата</FormLabel>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <FormControl>
                                                            <Button
                                                                variant={"outline"}
                                                                className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                                                disabled={isProcessing}
                                                            >
                                                                {field.value ? format(field.value, "PPP", { locale: ru }) : <span>Выберите дату</span>}
                                                            </Button>
                                                        </FormControl>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <Calendar
                                                            mode="single"
                                                            selected={field.value}
                                                            onSelect={field.onChange}
                                                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0)) || isProcessing}
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    <FormField
                                        control={form.control}
                                        name="startTime"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Время начала (ЧЧ:ММ)</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="09:00" {...field} disabled={isProcessing} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    <FormField
                                        control={form.control}
                                        name="endTime"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Время окончания (ЧЧ:ММ)</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="09:30" {...field} disabled={isProcessing} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    <Button type="submit" className="w-full" disabled={isProcessing || form.formState.isSubmitting}>
                                        {(isProcessing && form.formState.isSubmitting) ? 'Добавление...' : 'Добавить слот'}
                                    </Button>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Мои слоты</CardTitle>
                            <CardDescription>Список добавленных вами временных слотов.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {pageIsLoading && mySlots.length > 0 && <p>Обновление списка...</p>}
                            {!pageIsLoading && mySlots.length === 0 && !error && (
                                <p>У вас еще нет добавленных слотов.</p>
                            )}
                            {mySlots.length > 0 && (
                                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                                    {Object.entries(groupedExistingSlots).map(([date, slotsOnDate]) => (
                                        <div key={date}>
                                            <h3 className="font-semibold mb-2 text-lg">
                                                {format(parseISO(date), 'd MMMM<y_bin_46>, EEEE', { locale: ru })}
                                            </h3>
                                            <div className="flex flex-wrap items-center gap-2">
                                                {slotsOnDate.map((slot: ScheduleSlot) => (
                                                    <div key={slot.id} className="flex items-center gap-1">
                                                        <Badge variant={slot.is_available ? 'outline' : 'secondary'}>
                                                            {slot.start_time} - {slot.end_time} {!slot.is_available ? '(Занят)' : ''}
                                                        </Badge>
                                                        {slot.is_available && (
                                                            <AlertDialog
                                                                open={isAlertOpen && slotToDelete?.id === slot.id}
                                                                onOpenChange={(open) => {
                                                                    if (!open) {
                                                                        setIsAlertOpen(false);
                                                                        setSlotToDelete(null);
                                                                    } else {
                                                                        setIsAlertOpen(open);
                                                                    }
                                                                }}
                                                            >
                                                                <AlertDialogTrigger asChild>
                                                                    <Button
                                                                        variant="ghost" size="icon"
                                                                        className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                                                        onClick={() => handleDeleteClick(slot)}
                                                                        disabled={isProcessing}
                                                                        aria-label="Удалить слот"
                                                                    >
                                                                        {(isProcessing && slotToDelete?.id === slot.id) ? (<span className="animate-spin text-xs">...</span>) : (<span className="font-bold">X</span>)}
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                                {isAlertOpen && slotToDelete?.id === slot.id && (
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle>Подтвердить удаление</AlertDialogTitle>
                                                                            <AlertDialogDescription>
                                                                                Вы уверены, что хотите удалить слот <span className="font-semibold">{slotToDelete?.date} {slotToDelete?.start_time}</span>? Это действие необратимо.
                                                                            </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel onClick={() => { setIsAlertOpen(false); setSlotToDelete(null); }} disabled={isProcessing}>Отмена</AlertDialogCancel>
                                                                            <AlertDialogAction onClick={handleDeleteConfirm} disabled={isProcessing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                                                {isProcessing ? 'Удаление...' : 'Удалить'}
                                                                            </AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                )}
                                                            </AlertDialog>
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
                </div>
            </div>
        </div>
    );
};

export default ManageSchedulePage;