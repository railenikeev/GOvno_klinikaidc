import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import axios from 'axios'; // Для проверки ошибок

import apiClient from '@/services/apiClient'; // Наш API клиент
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Toaster, toast } from "sonner";
// import { useAuth } from '@/contexts/AuthContext'; // Не нужен здесь напрямую, т.к. ProtectedRoute уже сработал

// Тип для специализации
interface Specialization {
    id: number;
    name: string;
}

// УДАЛЕНЫ MOCK_SPECIALIZATIONS_DATA

// Схема для формы добавления/редактирования
const specializationSchema = z.object({
    name: z.string().min(2, { message: 'Название должно быть не менее 2 символов' }),
});
type SpecializationFormValues = z.infer<typeof specializationSchema>;


const ManageSpecializationsPage: React.FC = () => {
    // Состояния для данных, загрузки, ошибок
    const [specializations, setSpecializations] = useState<Specialization[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true); // Начинаем с загрузки
    const [error, setError] = useState<string | null>(null);

    // Состояния для диалоговых окон
    const [isAddEditDialogOpen, setIsAddEditDialogOpen] = useState(false);
    const [editingSpecialization, setEditingSpecialization] = useState<Specialization | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingSpecialization, setDeletingSpecialization] = useState<Specialization | null>(null);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);

    // Настройка формы
    const form = useForm<SpecializationFormValues>({
        resolver: zodResolver(specializationSchema),
        defaultValues: { name: '' },
    });
    const { formState: { isSubmitting } } = form;


    // --- Функция Загрузки Специализаций ---
    const fetchSpecializations = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await apiClient.get<Specialization[]>('/specializations'); // Вызов GET API
            setSpecializations(response.data);
        } catch (err) {
            console.error("Ошибка загрузки специализаций:", err);
            const message = "Не удалось загрузить список специализаций.";
            setError(message);
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    }, []); // Пустой массив зависимостей - вызываем один раз

    // Загружаем данные при монтировании
    useEffect(() => {
        fetchSpecializations().catch(console.error);
    }, [fetchSpecializations]);


    // --- CRUD Операции с API ---

    const handleAdd = () => {
        form.reset({ name: '' });
        setEditingSpecialization(null);
        setIsAddEditDialogOpen(true);
    };

    const handleEdit = (spec: Specialization) => {
        setEditingSpecialization(spec);
        form.reset({ name: spec.name });
        setIsAddEditDialogOpen(true);
    };

    const handleDelete = (spec: Specialization) => {
        setDeletingSpecialization(spec);
        setIsDeleteDialogOpen(true);
    };

    // Сохранение (Добавление/Редактирование) - ТЕПЕРЬ С API
    const onSaveSubmit = async (data: SpecializationFormValues) => {
        const apiCall = editingSpecialization
            ? apiClient.put(`/specializations/${editingSpecialization.id}`, data) // PUT
            : apiClient.post('/specializations', data); // POST

        let successMessage = editingSpecialization
            ? `Специализация "${data.name}" успешно обновлена.`
            : `Специализация "${data.name}" успешно добавлена.`;
        let errorMessage = editingSpecialization
            ? "Не удалось обновить специализацию."
            : "Не удалось добавить специализацию.";

        try {
            await apiCall; // Выполняем запрос (PUT или POST)
            toast.success(successMessage);
            setIsAddEditDialogOpen(false);
            setEditingSpecialization(null);
            await fetchSpecializations(); // Обновляем список
        } catch (error) {
            console.error("Ошибка сохранения специализации:", error);
            if (axios.isAxiosError(error) && error.response) {
                errorMessage = error.response.data?.error || errorMessage;
                if(error.response.status === 409) { // Конфликт имени
                    form.setError("name", { type: "manual", message: errorMessage });
                } else {
                    toast.error(errorMessage);
                }
            } else if (error instanceof Error) {
                toast.error(error.message || errorMessage);
            } else {
                toast.error(errorMessage);
            }
            // Не закрываем диалог при ошибке, чтобы пользователь мог исправить
        }
        // isSubmitting управляется react-hook-form
    };

    // Подтверждение удаления - ТЕПЕРЬ С API
    const handleDeleteConfirm = async () => {
        if (!deletingSpecialization) return;
        setIsDeleting(true);

        let errorMessage = "Не удалось удалить специализацию.";

        try {
            // Вызываем DELETE API
            await apiClient.delete(`/specializations/${deletingSpecialization.id}`);
            toast.success(`Специализация "${deletingSpecialization.name}" удалена.`);
            // Обновляем список
            await fetchSpecializations();

        } catch (error) {
            console.error("Ошибка удаления специализации:", error);
            if (axios.isAxiosError(error) && error.response) {
                errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
                // Особо обрабатываем конфликт (если специализация используется) - 409 Conflict
                if (error.response.status === 409) {
                    errorMessage = error.response.data?.error || "Нельзя удалить, специализация используется.";
                }
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            toast.error(errorMessage);
        } finally {
            setIsDeleting(false);
            setIsDeleteDialogOpen(false); // Закрываем диалог в любом случае после попытки
            setDeletingSpecialization(null);
        }
    };


    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Управление Специализациями</h1>
                <Dialog open={isAddEditDialogOpen} onOpenChange={setIsAddEditDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={handleAdd}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Добавить
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>{editingSpecialization ? 'Редактировать специализацию' : 'Добавить специализацию'}</DialogTitle>
                            <DialogDescription>
                                {editingSpecialization ? 'Измените название и нажмите Сохранить.' : 'Введите название новой специализации.'}
                            </DialogDescription>
                        </DialogHeader>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSaveSubmit)} className="space-y-4 py-4">
                                <FormField control={form.control} name="name" render={({ field }) => (
                                    <FormItem> <FormLabel>Название</FormLabel> <FormControl> <Input placeholder="Например, Терапевт" {...field} /> </FormControl> <FormMessage /> </FormItem>
                                )}/>
                                <DialogFooter>
                                    <DialogClose asChild> <Button type="button" variant="outline">Отмена</Button> </DialogClose>
                                    <Button type="submit" disabled={isSubmitting}> {isSubmitting ? 'Сохранение...' : 'Сохранить'} </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Таблица специализаций */}
            {isLoading && <p>Загрузка специализаций...</p>}
            {error && <p className="text-red-500">{error}</p>}
            {!isLoading && !error && (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader> <TableRow> <TableHead className="w-[80px]">ID</TableHead> <TableHead>Название</TableHead> <TableHead className="text-right w-[120px]">Действия</TableHead> </TableRow> </TableHeader>
                            <TableBody>
                                {specializations.length === 0 ? (
                                    <TableRow> <TableCell colSpan={3} className="h-24 text-center"> Специализации не найдены. </TableCell> </TableRow>
                                ) : (
                                    specializations.map((spec) => (
                                        <TableRow key={spec.id}>
                                            <TableCell className="font-mono text-xs">{spec.id}</TableCell>
                                            <TableCell className="font-medium">{spec.name}</TableCell>
                                            <TableCell className="text-right space-x-1">
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(spec)}> <Edit className="h-4 w-4" /> <span className="sr-only">Редактировать</span> </Button>
                                                <AlertDialog open={isDeleteDialogOpen && deletingSpecialization?.id === spec.id} onOpenChange={ (open) => {if(!open) setIsDeleteDialogOpen(false)} }>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive/80" onClick={() => handleDelete(spec)}> <Trash2 className="h-4 w-4" /> <span className="sr-only">Удалить</span> </Button>
                                                    </AlertDialogTrigger>
                                                    {/* Содержимое диалога рендерится только если он открыт для этого элемента */}
                                                    {deletingSpecialization?.id === spec.id && (
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader> <AlertDialogTitle>Подтвердить удаление</AlertDialogTitle> <AlertDialogDescription> Вы уверены, что хотите удалить специализацию <span className="font-semibold">{deletingSpecialization?.name}</span>? </AlertDialogDescription> </AlertDialogHeader>
                                                            <AlertDialogFooter> <AlertDialogCancel onClick={() => setDeletingSpecialization(null)}>Отмена</AlertDialogCancel> <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"> {isDeleting ? 'Удаление...' : 'Удалить'} </AlertDialogAction> </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    )}
                                                </AlertDialog>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            <Button variant="outline" asChild className="mt-6">
                <Link to="/admin/users">К управлению пользователями</Link>
            </Button>
            <Button variant="outline" asChild className="mt-6 ml-2">
                <Link to="/">На главную</Link>
            </Button>
        </div>
    );
};

export default ManageSpecializationsPage;