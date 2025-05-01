import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { PlusCircle, Edit, Trash2 } from 'lucide-react'; // <-- Импортируем нужные иконки

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog"; // Компоненты Dialog
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Toaster, toast } from "sonner";

// Тип для специализации
interface Specialization {
    id: number;
    name: string;
}

// --- Mock Данные ---
const MOCK_SPECIALIZATIONS_DATA: Specialization[] = [
    { id: 1, name: 'Терапевт' },
    { id: 2, name: 'Кардиолог' },
    { id: 3, name: 'Невролог' },
    { id: 4, name: 'Окулист' },
];
// --- Конец Mock Данных ---

// Схема для формы добавления/редактирования
const specializationSchema = z.object({
    name: z.string().min(2, { message: 'Название должно быть не менее 2 символов' }),
});
type SpecializationFormValues = z.infer<typeof specializationSchema>;


const ManageSpecializationsPage: React.FC = () => {
    // Используем mock данные как начальное состояние
    const [specializations, setSpecializations] = useState<Specialization[]>(MOCK_SPECIALIZATIONS_DATA);
    const [isLoading, setIsLoading] = useState<boolean>(false); // Пока не используется, но может понадобиться при реальном API

    // Состояние для диалоговых окон
    const [isAddEditDialogOpen, setIsAddEditDialogOpen] = useState(false);
    const [editingSpecialization, setEditingSpecialization] = useState<Specialization | null>(null); // null - добавление, объект - редактирование
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingSpecialization, setDeletingSpecialization] = useState<Specialization | null>(null);

    // Настройка формы
    const form = useForm<SpecializationFormValues>({
        resolver: zodResolver(specializationSchema),
        defaultValues: { name: '' },
    });

    // Функция открытия диалога для добавления
    const handleAdd = () => {
        form.reset({ name: '' }); // Сбрасываем форму
        setEditingSpecialization(null); // Указываем, что это добавление
        setIsAddEditDialogOpen(true);
    };

    // Функция открытия диалога для редактирования
    const handleEdit = (spec: Specialization) => {
        setEditingSpecialization(spec); // Запоминаем редактируемую сущность
        form.reset({ name: spec.name }); // Устанавливаем текущее значение в форму
        setIsAddEditDialogOpen(true);
    };

    // Функция открытия диалога для удаления
    const handleDelete = (spec: Specialization) => {
        setDeletingSpecialization(spec);
        setIsDeleteDialogOpen(true);
    };

    // Обработчик сохранения (добавление/редактирование)
    const onSaveSubmit = (data: SpecializationFormValues) => {
        // --- Имитация вызова API ---
        console.log("Сохранение:", data, "Редактирование:", editingSpecialization);
        try {
            if (editingSpecialization) {
                // Имитация редактирования
                setSpecializations(prev =>
                    prev.map(s => s.id === editingSpecialization.id ? { ...s, name: data.name } : s)
                );
                toast.success(`Специализация "${data.name}" успешно обновлена.`);
            } else {
                // Имитация добавления
                const newId = Math.max(0, ...specializations.map(s => s.id)) + 1; // Генерируем новый ID
                const newSpec = { id: newId, name: data.name };
                setSpecializations(prev => [...prev, newSpec]);
                toast.success(`Специализация "${data.name}" успешно добавлена.`);
            }
            setIsAddEditDialogOpen(false); // Закрываем диалог
        } catch (error) {
            toast.error("Ошибка при сохранении специализации.");
            console.error("Ошибка сохранения:", error);
        }
    };

    // Обработчик подтверждения удаления
    const handleDeleteConfirm = () => {
        if (!deletingSpecialization) return;
        // --- Имитация вызова API ---
        console.log("Удаление:", deletingSpecialization);
        try {
            setSpecializations(prev => prev.filter(s => s.id !== deletingSpecialization.id));
            toast.success(`Специализация "${deletingSpecialization.name}" удалена.`);
            setIsDeleteDialogOpen(false); // Закрываем диалог
            setDeletingSpecialization(null);
        } catch (error) {
            toast.error("Ошибка при удалении специализации.");
            console.error("Ошибка удаления:", error);
        }
    };


    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Управление Специализациями</h1>
                {/* Кнопка Добавить */}
                <Dialog open={isAddEditDialogOpen} onOpenChange={setIsAddEditDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={handleAdd}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Добавить
                        </Button>
                    </DialogTrigger>
                    {/* Содержимое диалога Добавления/Редактирования */}
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>{editingSpecialization ? 'Редактировать специализацию' : 'Добавить специализацию'}</DialogTitle>
                            <DialogDescription>
                                {editingSpecialization ? 'Измените название и нажмите Сохранить.' : 'Введите название новой специализации.'}
                            </DialogDescription>
                        </DialogHeader>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSaveSubmit)} className="space-y-4 py-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Название</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Например, Терапевт" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button type="button" variant="outline">Отмена</Button>
                                    </DialogClose>
                                    <Button type="submit" disabled={form.formState.isSubmitting}>
                                        {form.formState.isSubmitting ? 'Сохранение...' : 'Сохранить'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Таблица специализаций */}
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[80px]">ID</TableHead>
                                <TableHead>Название</TableHead>
                                <TableHead className="text-right w-[120px]">Действия</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {specializations.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center">
                                        Специализации не найдены.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                specializations.map((spec) => (
                                    <TableRow key={spec.id}>
                                        <TableCell className="font-mono text-xs">{spec.id}</TableCell>
                                        <TableCell className="font-medium">{spec.name}</TableCell>
                                        <TableCell className="text-right space-x-1">
                                            {/* Кнопка Редактировать */}
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(spec)}>
                                                <Edit className="h-4 w-4" />
                                                <span className="sr-only">Редактировать</span>
                                            </Button>
                                            {/* Кнопка Удалить */}
                                            <AlertDialog open={isDeleteDialogOpen && deletingSpecialization?.id === spec.id} onOpenChange={ (open) => {if(!open) setIsDeleteDialogOpen(false)} }>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive/80" onClick={() => handleDelete(spec)}>
                                                        <Trash2 className="h-4 w-4" />
                                                        <span className="sr-only">Удалить</span>
                                                    </Button>
                                                </AlertDialogTrigger>
                                                {/* Содержимое диалога удаления вынесено сюда */}
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Подтвердить удаление</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Вы уверены, что хотите удалить специализацию <span className="font-semibold">{deletingSpecialization?.name}</span>?
                                                            Это действие необратимо. (Примечание: в реальной системе может потребоваться проверка, не используется ли специализация врачами).
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel onClick={() => setDeletingSpecialization(null)}>Отмена</AlertDialogCancel>
                                                        <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                            Удалить
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Button variant="outline" asChild className="mt-6">
                <Link to="/">Назад к панели</Link>
            </Button>
        </div>
    );
};

export default ManageSpecializationsPage;