import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format, parse, isValid, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { AxiosError } from 'axios'; // <-- Импортируем AxiosError
import { CalendarIcon } from "lucide-react";

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext'; // Для проверки роли (хотя ProtectedRoute уже есть)
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar"; // Календарь
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"; // Для календаря
import { Toaster, toast } from "sonner";
import { cn } from "@/lib/utils";

// Тип для слота (из ответа GET /schedules/my)
interface ScheduleSlot {
    id: number;
    doctor_id: number;
    date: string;       // Формат "YYYY-MM-DD"
    start_time: string; // Формат "HH:MM"
    end_time: string;   // Формат "HH:MM"
    is_available: boolean;
}

// Схема валидации для формы добавления слота
const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/; // HH:MM format

const addSlotSchema = z.object({
    date: z.date({ required_error: "Выберите дату." }),
    startTime: z.string().regex(timeRegex, { message: "Формат ЧЧ:ММ" }),
    endTime: z.string().regex(timeRegex, { message: "Формат ЧЧ:ММ" }),
}).refine(data => {
    // Проверка, что время окончания позже времени начала
    const start = parse(data.startTime, 'HH:mm', new Date());
    const end = parse(data.endTime, 'HH:mm', new Date());
    return isValid(start) && isValid(end) && end > start;
}, {
    message: "Время окончания должно быть позже времени начала",
    path: ["endTime"], // Ошибка будет показана у поля endTime
});

type AddSlotFormValues = z.infer<typeof addSlotSchema>;

const ManageSchedulePage: React.FC = () => {
    const { user } = useAuth();
    const [mySlots, setMySlots] = useState<ScheduleSlot[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const form = useForm<AddSlotFormValues>({
        resolver: zodResolver(addSlotSchema),
        defaultValues: {
            date: undefined, // Начинаем без выбранной даты
            startTime: '',
            endTime: '',
        }
    });

    // Загрузка существующих слотов
    const fetchMySlots = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await apiClient.get<ScheduleSlot[]>('/schedules/my');
            // Сортируем по дате и времени для отображения
            response.data.sort((a, b) => {
                const dateComparison = a.date.localeCompare(b.date);
                if (dateComparison !== 0) return dateComparison;
                return a.start_time.localeCompare(b.start_time);
            });
            setMySlots(response.data);
        } catch (err) {
            console.error("Ошибка загрузки расписания:", err);
            setError("Не удалось загрузить расписание.");
            toast.error("Не удалось загрузить расписание.");
        } finally {
            setIsLoading(false);
        }
    }, []); // useCallback, чтобы не пересоздавать функцию

    useEffect(() => {
        if (user && user.role === 'doctor') {
            fetchMySlots().catch(console.error);
        }
    }, [user, fetchMySlots]);

    // Обработчик добавления слота
    const onAddSlotSubmit = async (data: AddSlotFormValues) => {
        const payload = {
            date: format(data.date, 'yyyy-MM-dd'), // Форматируем дату для API
            start_time: data.startTime,
            end_time: data.endTime,
        };
        console.log("Adding slot:", payload);

        try {
            const response = await apiClient.post<ScheduleSlot>('/schedules', payload);
            if (response.status === 201) {
                toast.success(`Слот на ${payload.date} ${payload.start_time} добавлен!`);
                form.reset(); // Очищаем форму
                fetchMySlots(); // Обновляем список слотов
            } else {
                throw new Error("Неожиданный ответ сервера при добавлении слота");
            }
        } catch (error) {
            console.error("Ошибка добавления слота:", error);
            let message = "Не удалось добавить слот.";
            if (axios.isAxiosError(error) && error.response) {
                if (error.response.status === 409) { // Conflict (слот уже есть)
                    message = error.response.data?.error || "Такой слот уже существует.";
                } else {
                    message = error.response.data?.error || message;
                }
            } else if (error instanceof Error) {
                message = error.message;
            }
            toast.error(message);
        }
    };

    // Группировка существующих слотов по дате
    const groupedExistingSlots = useMemo(() => {
        return mySlots.reduce((acc, slot) => {
            (acc[slot.date] = acc[slot.date] || []).push(slot);
            return acc;
        }, {} as Record<string, ScheduleSlot[]>);
    }, [mySlots]);


    // Рендеринг
    if (isLoading) {
        return <div className="container mx-auto p-4">Загрузка расписания...</div>;
    }

    if (error) {
        return <div className="container mx-auto p-4 text-red-500">{error}</div>;
    }

    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Управление расписанием</h1>
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
                                    {/* Выбор даты */}
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
                                                                className={cn(
                                                                    "w-full pl-3 text-left font-normal",
                                                                    !field.value && "text-muted-foreground"
                                                                )}
                                                            >
                                                                {field.value ? (
                                                                    format(field.value, "PPP", {locale: ru})
                                                                ) : (
                                                                    <span>Выберите дату</span>
                                                                )}
                                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                            </Button>
                                                        </FormControl>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <Calendar
                                                            mode="single"
                                                            selected={field.value}
                                                            onSelect={field.onChange}
                                                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))} // Нельзя выбрать прошлые даты
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {/* Время начала */}
                                    <FormField
                                        control={form.control}
                                        name="startTime"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Время начала (ЧЧ:ММ)</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="09:00" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {/* Время окончания */}
                                    <FormField
                                        control={form.control}
                                        name="endTime"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Время окончания (ЧЧ:ММ)</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="09:30" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                                        {form.formState.isSubmitting ? 'Добавление...' : 'Добавить слот'}
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
                            {mySlots.length === 0 ? (
                                <p>У вас еще нет добавленных слотов.</p>
                            ) : (
                                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2"> {/* Скролл */}
                                    {Object.entries(groupedExistingSlots).map(([date, slots]) => (
                                        <div key={date}>
                                            <h3 className="font-semibold mb-2 text-lg">
                                                {format(parseISO(date), 'd MMMMcameraContinuous, EEEE', { locale: ru })}
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {slots.map((slot) => (
                                                    <Badge key={slot.id} variant={slot.is_available ? 'outline' : 'secondary'}>
                                                        {slot.start_time} - {slot.end_time} {!slot.is_available ? '(Занят)' : ''}
                                                        {/* TODO: Добавить кнопку удаления/редактирования слота */}
                                                    </Badge>
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