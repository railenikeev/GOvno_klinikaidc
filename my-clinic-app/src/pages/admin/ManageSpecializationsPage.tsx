// my-clinic-app/src/pages/admin/ManageSpecializationsPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import axios from 'axios';

import apiClient from '@/services/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Toaster, toast } from "sonner";
// import { useAuth } from '@/contexts/AuthContext'; // Не нужен здесь напрямую, ProtectedRoute уже сработал

// Тип для специализации
interface Specialization {
    id: number;
    name: string;
}

// Схема для формы добавления/редактирования
const specializationSchema = z.object({
    name: z.string().min(2, { message: 'Название должно быть не менее 2 символов' }).max(100, {message: 'Название не должно превышать 100 символов'}),
});
type SpecializationFormValues = z.infer<typeof specializationSchema>;


const ManageSpecializationsPage: React.FC = () => {
    const [specializations, setSpecializations] = useState<Specialization[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [isAddEditDialogOpen, setIsAddEditDialogOpen] = useState(false);
    const [editingSpecialization, setEditingSpecialization] = useState<Specialization | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingSpecialization, setDeletingSpecialization] = useState<Specialization | null>(null);
    const [isSubmittingOperation, setIsSubmittingOperation] = useState<boolean>(false); // Для submit и delete

    const form = useForm<SpecializationFormValues>({
        resolver: zodResolver(specializationSchema),
        defaultValues: { name: '' },
    });

    const fetchSpecializations = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await apiClient.get<Specialization[]>('/specializations');
            setSpecializations(response.data || []);
        } catch (err: any) {
            console.error("Ошибка загрузки специализаций:", err);
            let message = "Не удалось загрузить список специализаций.";
            if (axios.isAxiosError(err) && err.response) {
                if (err.response.status === 401 || err.response.status === 403) {
                    message = "Доступ запрещен. Убедитесь, что вы вошли как администратор.";
                } else {
                    message = err.response.data?.error || `Ошибка сервера (${err.response.status})`;
                }
            } else if (err instanceof Error) {
                message = err.message;
            }
            setError(message);
            toast.error(message);
            setSpecializations([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSpecializations();
    }, [fetchSpecializations]);

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

    const onSaveSubmit = async (data: SpecializationFormValues) => {
        setIsSubmittingOperation(true);
        const apiCall = editingSpecialization
            ? apiClient.put(`/specializations/${editingSpecialization.id}`, data)
            : apiClient.post('/specializations', data);

        let successMessage = editingSpecialization
            ? `Специализация "${data.name}" успешно обновлена.`
            : `Специализация "${data.name}" успешно добавлена.`;
        let errorMessageToast = editingSpecialization
            ? "Не удалось обновить специализацию."
            : "Не удалось добавить специализацию.";

        try {
            const response = await apiCall;
            if (response.status === 200 || response.status === 201) {
                toast.success(successMessage);
                setIsAddEditDialogOpen(false);
                setEditingSpecialization(null);
                await fetchSpecializations(); // Обновляем список
            } else {
                // На случай если бэкенд вернет 2xx, но не 200/201 с данными
                throw new Error(response.data?.error || `Неожиданный статус: ${response.status}`);
            }
        } catch (error: any) {
            console.error("Ошибка сохранения специализации:", error);
            let formErrorMessage = errorMessageToast;
            if (axios.isAxiosError(error) && error.response) {
                formErrorMessage = error.response.data?.error || errorMessageToast;
                if (error.response.status === 409) { // Конфликт имени
                    form.setError("name", { type: "manual", message: formErrorMessage });
                } else {
                    toast.error(formErrorMessage);
                }
            } else if (error instanceof Error) {
                formErrorMessage = error.message || errorMessageToast;
                toast.error(formErrorMessage);
            } else {
                toast.error(errorMessageToast);
            }
        } finally {
            setIsSubmittingOperation(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deletingSpecialization) return;
        setIsSubmittingOperation(true);
        setIsDeleteDialogOpen(false); // Закрываем диалог сразу

        let errorMessage = "Не удалось удалить специализацию.";

        try {
            await apiClient.delete(`/specializations/${deletingSpecialization.id}`);
            toast.success(`Специализация "${deletingSpecialization.name}" удалена.`);
            await fetchSpecializations(); // Обновляем список
        } catch (error: any) {
            console.error("Ошибка удаления специализации:", error);
            if (axios.isAxiosError(error) && error.response) {
                errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
                if (error.response.status === 409) {
                    errorMessage = error.response.data?.error || "Нельзя удалить, специализация используется.";
                }
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            toast.error(errorMessage);
        } finally {
            setIsSubmittingOperation(false);
            setDeletingSpecialization(null);
        }
    };

    const renderTableContent = () => {
        if (isLoading) { // Показываем только если это первоначальная загрузка и нет ошибки
            return (
                <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center">Загрузка специализаций...</TableCell>
                </TableRow>
            );
        }
        if (error && specializations.length === 0) {
            return (
                <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-red-500">{error}</TableCell>
                </TableRow>
            );
        }
        if (!isLoading && specializations.length === 0 && !error) {
            return (
                <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center">
                        Специализации не найдены. Вы можете добавить новую.
                    </TableCell>
                </TableRow>
            );
        }

        return specializations.map((spec) => (
            <TableRow key={spec.id}>
                <TableCell className="font-mono text-xs">{spec.id}</TableCell>
                <TableCell className="font-medium">{spec.name}</TableCell>
                <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(spec)} disabled={isSubmittingOperation}>
                        <Edit className="h-4 w-4" /> <span className="sr-only">Редактировать</span>
                    </Button>
                    <AlertDialog
                        open={isDeleteDialogOpen && deletingSpecialization?.id === spec.id}
                        onOpenChange={(open) => {
                            if (!open) {
                                setIsDeleteDialogOpen(false);
                                setDeletingSpecialization(null);
                            }
                        }}
                    >
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive/80" onClick={() => handleDelete(spec)} disabled={isSubmittingOperation}>
                                <Trash2 className="h-4 w-4" /> <span className="sr-only">Удалить</span>
                            </Button>
                        </AlertDialogTrigger>
                        {/* Содержимое диалога рендерится только если он открыт для этого элемента */}
                        {/* Это гарантирует, что правильный deletingSpecialization используется */}
                        {deletingSpecialization?.id === spec.id && (
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Подтвердить удаление</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Вы уверены, что хотите удалить специализацию <span className="font-semibold">{deletingSpecialization?.name}</span>?
                                        Это действие не может быть отменено.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel disabled={isSubmittingOperation}>Отмена</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDeleteConfirm} disabled={isSubmittingOperation} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                        {isSubmittingOperation ? 'Удаление...' : 'Удалить'}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        )}
                    </AlertDialog>
                </TableCell>
            </TableRow>
        ));
    };


    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Управление Специализациями</h1>
                <Dialog open={isAddEditDialogOpen} onOpenChange={setIsAddEditDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={handleAdd} disabled={isLoading}> {/* Блокируем, пока идет основная загрузка */}
                            <PlusCircle className="mr-2 h-4 w-4" /> Добавить
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>{editingSpecialization ? 'Редактировать специализацию' : 'Добавить специализацию'}</DialogTitle>
                            <DialogDescription>
                                {editingSpecialization ? `Измените название специализации "${editingSpecialization.name}" и нажмите Сохранить.` : 'Введите название новой специализации.'}
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
                                                <Input placeholder="Например, Терапевт" {...field} disabled={isSubmittingOperation} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button type="button" variant="outline" disabled={isSubmittingOperation}>Отмена</Button>
                                    </DialogClose>
                                    <Button type="submit" disabled={isSubmittingOperation || form.formState.isSubmitting}>
                                        {isSubmittingOperation ? 'Сохранение...' : 'Сохранить'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                </Dialog>
            </div>

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
                            {renderTableContent()}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="mt-6 space-x-2">
                <Button variant="outline" asChild>
                    <Link to="/admin/users">К управлению пользователями</Link>
                </Button>
                <Button variant="outline" asChild>
                    <Link to="/">На главную</Link>
                </Button>
            </div>
        </div>
    );
};

export default ManageSpecializationsPage;