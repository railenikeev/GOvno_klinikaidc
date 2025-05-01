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
    const { user } = useAuth();
    const [mySlots, setMySlots] = useState<ScheduleSlot[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [deletingSlotId, setDeletingSlotId] = useState<number | null>(null);
    const [isAlertOpen, setIsAlertOpen] = useState(false);
    const [slotToDelete, setSlotToDelete] = useState<ScheduleSlot | null>(null);


    const form = useForm<AddSlotFormValues>({
        resolver: zodResolver(addSlotSchema),
        defaultValues: { date: undefined, startTime: '', endTime: '' }
    });

    // Загрузка существующих слотов
    const fetchMySlots = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await apiClient.get<ScheduleSlot[]>('/schedules/my');
            response.data.sort((a, b) => {
                const dateComparison = a.date.localeCompare(b.date);
                if (dateComparison !== 0) return dateComparison;
                return a.start_time.localeCompare(b.start_time);
            });
            setMySlots(response.data);
        } catch (err) {
            // Удалили console.error отсюда
            setError("Не удалось загрузить расписание.");
            toast.error("Не удалось загрузить расписание.");
        } finally {
            setIsLoading(false);
        }
    }, []); // Убрали isLoading из зависимостей useCallback, он не нужен там

    useEffect(() => {
        if (user && user.role === 'doctor') {
            fetchMySlots().catch(err => console.error("Error from fetchMySlots effect:", err));
        }
    }, [user, fetchMySlots]);

    // Обработчик добавления слота
    const onAddSlotSubmit = async (data: AddSlotFormValues) => {
        const payload = { date: format(data.date, 'yyyy-MM-dd'), start_time: data.startTime, end_time: data.endTime, };
        let errorMessage = "Не удалось добавить слот.";
        try {
            const response = await apiClient.post<ScheduleSlot>('/schedules', payload);
            if (response.status === 201) {
                toast.success(`Слот на ${payload.date} ${payload.start_time} добавлен!`);
                form.reset();
                await fetchMySlots();
                return;
            } else {
                console.error("Ошибка добавления слота: Неожиданный статус ответа", response);
                errorMessage = `Неожиданный ответ сервера: ${response.status}`;
            }
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                if (error.response.status === 409) { errorMessage = error.response.data?.error || "Такой слот уже существует.";
                } else { errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`; }
            } else if (error instanceof Error) { errorMessage = error.message; }
        }
        toast.error(errorMessage);
    };

    const handleDeleteClick = (slot: ScheduleSlot) => {
        if (!slot.is_available) { toast.info("Нельзя удалить слот, на который уже есть запись."); return; }
        setSlotToDelete(slot);
        setIsAlertOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!slotToDelete) return;
        setDeletingSlotId(slotToDelete.id);
        setIsAlertOpen(false);
        try {
            console.log(`Имитация удаления слота ID: ${slotToDelete.id}`);
            // await apiClient.delete(`/schedules/${slotToDelete.id}`); // Закомментировано
            await new Promise(resolve => setTimeout(resolve, 1000));
            toast.success(`Слот ${slotToDelete.date} ${slotToDelete.start_time} успешно удален.`);
            await fetchMySlots();
        } catch (error) {
            console.error("Ошибка удаления слота:", error);
            let message = "Не удалось удалить слот.";
            if (axios.isAxiosError(error) && error.response) { message = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
            } else if (error instanceof Error) { message = error.message; }
            toast.error(message);
        } finally {
            setDeletingSlotId(null);
            setSlotToDelete(null);
        }
    };

    // Группировка существующих слотов по дате
    const groupedExistingSlots = useMemo(() => {
        return mySlots.reduce((acc, slot) => { (acc[slot.date] = acc[slot.date] || []).push(slot); return acc; }, {} as Record<string, ScheduleSlot[]>);
    }, [mySlots]);


    // Рендеринг
    if (isLoading) {
        return <div className="container mx-auto p-4">Загрузка расписания...</div>;
    }
    if (error) {
        return <div className="container mx-auto p-4 text-red-500">{error}</div>;
    }

    // Удалили переменную selectedDoctor

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
                        <CardHeader> <CardTitle>Добавить новый слот</CardTitle> </CardHeader>
                        <CardContent>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onAddSlotSubmit)} className="space-y-4">
                                    {/* Выбор даты */}
                                    <FormField control={form.control} name="date" render={({ field }) => (
                                        <FormItem className="flex flex-col"> <FormLabel>Дата</FormLabel> <Popover> <PopoverTrigger asChild> <FormControl> <Button variant={"outline"} className={cn( "w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground" )}> {field.value ? format(field.value, "PPP", {locale: ru}) : <span>Выберите дату</span>} </Button> </FormControl> </PopoverTrigger> <PopoverContent className="w-auto p-0" align="start"> <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))} initialFocus /> </PopoverContent> </Popover> <FormMessage /> </FormItem>
                                    )}/>
                                    {/* Время начала */}
                                    <FormField control={form.control} name="startTime" render={({ field }) => (
                                        <FormItem> <FormLabel>Время начала (ЧЧ:ММ)</FormLabel> <FormControl> <Input placeholder="09:00" {...field} /> </FormControl> <FormMessage /> </FormItem>
                                    )}/>
                                    {/* Время окончания */}
                                    <FormField control={form.control} name="endTime" render={({ field }) => (
                                        <FormItem> <FormLabel>Время окончания (ЧЧ:ММ)</FormLabel> <FormControl> <Input placeholder="09:30" {...field} /> </FormControl> <FormMessage /> </FormItem>
                                    )}/>
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
                            {/* Убрали имя врача из описания */}
                            <CardDescription>Список добавленных вами временных слотов.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {mySlots.length === 0 ? (
                                <p>У вас еще нет добавленных слотов.</p>
                            ) : (
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
                                                            <AlertDialog>
                                                                <AlertDialogTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                                                        onClick={(e) => { e.stopPropagation(); handleDeleteClick(slot); }}
                                                                        disabled={deletingSlotId === slot.id}
                                                                        aria-label="Удалить слот"
                                                                    >
                                                                        {deletingSlotId === slot.id ? ( <span className="animate-spin text-xs">...</span> ) : ( <span className="font-bold">X</span> )}
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                                {isAlertOpen && slotToDelete?.id === slot.id && (
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader> <AlertDialogTitle>Подтвердить удаление</AlertDialogTitle> <AlertDialogDescription> Вы уверены, что хотите удалить слот <span className="font-semibold"> {slotToDelete?.date} {slotToDelete?.start_time}</span>? Это действие необратимо. </AlertDialogDescription> </AlertDialogHeader>
                                                                        <AlertDialogFooter> <AlertDialogCancel onClick={() => { setIsAlertOpen(false); setSlotToDelete(null); }}>Отмена</AlertDialogCancel> <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"> Удалить </AlertDialogAction> </AlertDialogFooter>
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