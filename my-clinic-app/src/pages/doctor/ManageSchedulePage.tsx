import React, { useState, useEffect, useCallback, useMemo } from 'react'; // Добавлен useMemo
import { Link } from 'react-router-dom';
// Удалили addDays, т.к. generateMockSlots удалена
import { format, parse, isValid, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import axios from 'axios'; // Оставили axios для isAxiosError
// Удалили импорт иконок

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
// Удалили FormDescription
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Toaster, toast } from "sonner";
import { cn } from "@/lib/utils";

// Тип для слота
interface ScheduleSlot {
    id: number;
    doctor_id: number;
    date: string;
    start_time: string;
    end_time: string;
    is_available: boolean;
}

// УДАЛЕНЫ: MOCK_DOCTORS и generateMockSlots

// Схема валидации для формы добавления слота
const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
const addSlotSchema = z.object({
    date: z.date({ required_error: "Выберите дату." }),
    startTime: z.string().regex(timeRegex, { message: "Формат ЧЧ:ММ" }),
    endTime: z.string().regex(timeRegex, { message: "Формат ЧЧ:ММ" }),
}).refine(data => {
    const start = parse(data.startTime, 'HH:mm', new Date());
    const end = parse(data.endTime, 'HH:mm', new Date());
    return isValid(start) && isValid(end) && end > start;
}, { message: "Время окончания должно быть позже времени начала", path: ["endTime"], });
type AddSlotFormValues = z.infer<typeof addSlotSchema>;


const ManageSchedulePage: React.FC = () => {
    // ... (существующие состояния: user, mySlots, isLoading, error, deletingSlotId, isAlertOpen, slotToDelete) ...
    // Добавим состояние для общей блокировки операций
    const [isProcessing, setIsProcessing] = useState<boolean>(false);

    const form = useForm<AddSlotFormValues>({
        resolver: zodResolver(addSlotSchema),
        defaultValues: { date: undefined, startTime: '', endTime: '' }
    });

    const fetchMySlots = useCallback(async () => {
        // ... (существующий код fetchMySlots, убедитесь, что toast.error вызывается при ошибке)
        // Устанавливаем setIsLoading(false) в finally
    }, []); // Зависимости как есть

    useEffect(() => {
        if (user && user.role === 'doctor') {
            fetchMySlots(); // Убрал .catch, т.к. обработка в fetchMySlots
        }
    }, [user, fetchMySlots]);

    const onAddSlotSubmit = async (data: AddSlotFormValues) => {
        setIsProcessing(true); // Блокируем на время операции
        const payload = {
            date: format(data.date, 'yyyy-MM-dd'),
            start_time: data.startTime,
            end_time: data.endTime,
        };
        let errorMessage = "Не удалось добавить слот.";
        try {
            const response = await apiClient.post<ScheduleSlot>('/schedules', payload); // POST /api/schedules
            // Бэкенд schedules/main.go CreateScheduleSlotHandler возвращает 201 и созданный слот
            if (response.status === 201 && response.data) {
                toast.success(`Слот на ${response.data.date} ${response.data.start_time} добавлен!`);
                form.reset({ date: undefined, startTime: '', endTime: ''}); // Сброс формы
                await fetchMySlots(); // Обновляем список слотов
            } else {
                // Если статус не 201 или нет данных, считаем это ошибкой
                console.error("Ошибка добавления слота: Неожиданный ответ сервера", response);
                errorMessage = `Неожиданный ответ сервера: ${response.status}`;
                toast.error(errorMessage);
            }
        } catch (error: any) { // Уточнил тип any для error
            if (axios.isAxiosError(error) && error.response) {
                if (error.response.status === 409) { // Conflict - такой слот уже существует
                    errorMessage = error.response.data?.error || "Такой слот уже существует или пересекается с существующим.";
                } else if (error.response.status === 400) { // Bad Request - например, время окончания раньше начала
                    errorMessage = error.response.data?.error || "Неверные данные слота (например, время окончания раньше начала).";
                }
                else {
                    errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
                }
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            toast.error(errorMessage);
        } finally {
            setIsProcessing(false); // Разблокируем в любом случае
        }
    };

    const handleDeleteClick = (slot: ScheduleSlot) => {
        if (!slot.is_available) {
            toast.info("Нельзя удалить слот, на который уже есть запись или он недоступен.");
            return;
        }
        setSlotToDelete(slot);
        setIsAlertOpen(true);
    };

    // ИСПРАВЛЯЕМ ЭТУ ФУНКЦИЮ
    const handleDeleteConfirm = async () => {
        if (!slotToDelete) return;

        setIsProcessing(true); // Используем общее состояние блокировки
        // setDeletingSlotId(slotToDelete.id); // Можно убрать, если isProcessing достаточно
        setIsAlertOpen(false); // Закрываем диалог

        let errorMessage = "Не удалось удалить слот.";
        try {
            // Используем реальный API вызов
            const response = await apiClient.delete(`/schedules/${slotToDelete.id}`); // DELETE /api/schedules/:id

            // Бэкенд schedules/main.go DeleteScheduleSlotHandler возвращает 204 No Content при успехе
            if (response.status === 204) {
                toast.success(`Слот ${slotToDelete.date} ${slotToDelete.start_time} успешно удален.`);
                await fetchMySlots(); // Обновляем список слотов
            } else {
                // Если статус не 204, это неожиданный ответ
                console.warn("Неожиданный ответ при удалении слота:", response);
                errorMessage = `Неожиданный ответ сервера: ${response.status}`;
                toast.error(errorMessage);
            }
        } catch (error: any) { // Уточнил тип any для error
            console.error("Ошибка удаления слота:", error);
            if (axios.isAxiosError(error) && error.response) {
                if (error.response.status === 409) { // Conflict - слот занят
                    errorMessage = error.response.data?.error || "Нельзя удалить занятый слот.";
                } else if (error.response.status === 404) { // Not Found
                    errorMessage = error.response.data?.error || "Слот не найден (возможно, уже удален).";
                } else if (error.response.status === 403) { // Forbidden
                    errorMessage = error.response.data?.error || "Доступ запрещен к удалению этого слота.";
                }
                else {
                    errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
                }
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            toast.error(errorMessage);
        } finally {
            setIsProcessing(false); // Разблокируем
            // setDeletingSlotId(null); // Можно убрать
            setSlotToDelete(null); // Сбрасываем слот для удаления
        }
    };

    const groupedExistingSlots = useMemo(() => {
        // ... (существующий код) ...
    }, [mySlots]);


    if (isLoading && mySlots.length === 0) { // Показываем только при первой загрузке
        return <div className="container mx-auto p-4">Загрузка расписания...</div>;
    }

    // Если есть ошибка и слоты не загружены
    if (error && mySlots.length === 0) {
        return <div className="container mx-auto p-4 text-red-500">{error}</div>;
    }

    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Управление моим расписанием</h1>
                <Button variant="outline" asChild>
                    <Link to="/">Назад к панели</Link>
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Форма добавления слота */}
                <div className="lg:col-span-1">
                    <Card>
                        <CardHeader>
                            <CardTitle>Добавить новый слот</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onAddSlotSubmit)} className="space-y-4">
                                    {/* ... (поля формы Date, StartTime, EndTime без изменений) ... */}
                                    {/* Поле Date */}
                                    <FormField control={form.control} name="date" render={({ field }) => (
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
                                    {/* Время начала */}
                                    <FormField control={form.control} name="startTime" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Время начала (ЧЧ:ММ)</FormLabel>
                                            <FormControl>
                                                <Input placeholder="09:00" {...field} disabled={isProcessing} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    {/* Время окончания */}
                                    <FormField control={form.control} name="endTime" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Время окончания (ЧЧ:ММ)</FormLabel>
                                            <FormControl>
                                                <Input placeholder="09:30" {...field} disabled={isProcessing} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <Button type="submit" className="w-full" disabled={isProcessing || form.formState.isSubmitting}>
                                        {isProcessing ? 'Обработка...' : 'Добавить слот'}
                                    </Button>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </div>

                {/* Список существующих слотов */}
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Мои слоты</CardTitle>
                            <CardDescription>Список добавленных вами временных слотов.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading && mySlots.length > 0 && <p>Обновление списка...</p> /* Показываем при перезагрузке */}
                            {!isLoading && mySlots.length === 0 && !error && ( // Если не грузится, слотов нет и ошибки нет
                                <p>У вас еще нет добавленных слотов.</p>
                            )}
                            {mySlots.length > 0 && (
                                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                                    {Object.entries(groupedExistingSlots).map(([date, slots]) => (
                                        <div key={date}>
                                            <h3 className="font-semibold mb-2 text-lg">
                                                {format(parseISO(date), 'd MMMM<y_bin_46>, EEEE', { locale: ru })}
                                            </h3>
                                            <div className="flex flex-wrap items-center gap-2">
                                                {slots.map((slot: ScheduleSlot) => (
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
                                                                    }
                                                                    // setIsAlertOpen(open) // Можно и так, но сброс slotToDelete важен
                                                                }}
                                                            >
                                                                <AlertDialogTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                                                        onClick={(e) => { e.stopPropagation(); handleDeleteClick(slot); }}
                                                                        disabled={isProcessing} // Общая блокировка
                                                                        aria-label="Удалить слот"
                                                                    >
                                                                        {isProcessing && slotToDelete?.id === slot.id ? ( <span className="animate-spin text-xs">...</span> ) : ( <span className="font-bold">X</span> )}
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                                {/* Контент диалога показывается только если slotToDelete соответствует этому слоту */}
                                                                {isAlertOpen && slotToDelete?.id === slot.id && (
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle>Подтвердить удаление</AlertDialogTitle>
                                                                            <AlertDialogDescription>
                                                                                Вы уверены, что хотите удалить слот
                                                                                <span className="font-semibold"> {slotToDelete?.date} {slotToDelete?.start_time}</span>?
                                                                                Это действие необратимо.
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