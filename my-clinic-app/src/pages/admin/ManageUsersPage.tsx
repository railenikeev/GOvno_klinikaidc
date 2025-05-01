import React, { useState, useEffect, useCallback } from 'react'; // Добавили useCallback
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Edit, Trash2 } from 'lucide-react';
import axios from 'axios'; // Для проверки ошибок

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent} from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
//import { Input } from '@/components/ui/input'; // Оставим, вдруг понадобится
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster, toast } from "sonner";

// --- Типы ---
interface Specialization {
    id: number;
    name: string;
}

interface UserAdminView {
    id: number;
    full_name: string;
    email: string;
    phone: string;
    role: 'patient' | 'doctor' | 'admin';
    specialization_id?: number | null;
    specialization_name?: string | null; // Бэкенд теперь возвращает имя
}
// --- Конец Типы ---

// УДАЛЕНЫ MOCK_USERS_DATA и MOCK_SPECIALIZATIONS

// --- Схема для формы редактирования ---
const userEditSchema = z.object({
    role: z.enum(['patient', 'doctor', 'admin'], { required_error: "Выберите роль" }),
    specializationId: z.string().optional(),
}).refine(data => {
    if (data.role === 'doctor') { return data.specializationId && data.specializationId !== 'null' && data.specializationId !== ''; }
    return true;
}, { message: "Для врача необходимо выбрать специализацию", path: ["specializationId"]});
type UserEditFormValues = z.infer<typeof userEditSchema>;
// --- Конец Схема ---


const ManageUsersPage: React.FC = () => {
    const { user: adminUser } = useAuth();
    const [users, setUsers] = useState<UserAdminView[]>([]); // Начинаем с пустого массива
    const [specializations, setSpecializations] = useState<Specialization[]>([]); // Загрузим реальные
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserAdminView | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingUser, setDeletingUser] = useState<UserAdminView | null>(null);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);

    const form = useForm<UserEditFormValues>({ resolver: zodResolver(userEditSchema) });
    const { formState: { isSubmitting } } = form;


    // --- Функция загрузки данных (Пользователи и Специализации) ---
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [usersResponse, specsResponse] = await Promise.all([
                apiClient.get<UserAdminView[]>('/users'), // GET /api/users
                apiClient.get<Specialization[]>('/specializations') // GET /api/specializations
            ]);
            // Сортируем пользователей по имени
            usersResponse.data.sort((a, b) => a.full_name.localeCompare(b.full_name));
            setUsers(usersResponse.data);
            setSpecializations(specsResponse.data);
        } catch (err) {
            console.error("Ошибка загрузки данных:", err);
            const message = "Не удалось загрузить данные пользователей или специализаций.";
            setError(message);
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData().catch(console.error);
    }, [fetchData]); // Вызываем при монтировании


    // --- CRUD Операции с API ---
    const handleEdit = (userToEdit: UserAdminView) => {
        setEditingUser(userToEdit);
        form.reset({
            role: userToEdit.role,
            specializationId: userToEdit.specialization_id?.toString() ?? "",
        });
        setIsEditUserDialogOpen(true);
    };

    const handleDelete = (userToDelete: UserAdminView) => {
        if (userToDelete.id === adminUser?.id) { toast.error("Нельзя удалить самого себя."); return; }
        setDeletingUser(userToDelete);
        setIsDeleteDialogOpen(true);
    };

    // Сохранение изменений пользователя (с API)
    const onEditUserSubmit = async (data: UserEditFormValues) => {
        if (!editingUser) return;

        const specIdStr = data.specializationId;
        const specId = data.role === 'doctor' && specIdStr && specIdStr !== 'null'
            ? parseInt(specIdStr, 10)
            : null;

        // Дополнительная проверка на NaN после parseInt
        if (data.role === 'doctor' && (specId === null || isNaN(specId))) {
            toast.error("Некорректный ID специализации выбран.");
            form.setError("specializationId", {type: "manual", message: "Выберите корректную специализацию"});
            return;
        }

        const payload = {
            role: data.role,
            specialization_id: specId, // Отправляем number | null
        };

        let errorMessage = "Не удалось обновить пользователя.";

        try {
            // Вызываем PATCH API
            await apiClient.patch(`/users/${editingUser.id}`, payload);
            toast.success(`Данные пользователя "${editingUser.full_name}" обновлены.`);
            setIsEditUserDialogOpen(false);
            setEditingUser(null);
            await fetchData(); // Обновляем список пользователей
        } catch (error) {
            console.error("Ошибка обновления пользователя:", error);
            if (axios.isAxiosError(error) && error.response) {
                errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
                // Обработка ошибки ненайденной специализации от бэкенда
                if(error.response.status === 400 && error.response.data?.error?.includes("Специализация")) {
                    form.setError("specializationId", { type: "manual", message: error.response.data.error });
                } else {
                    toast.error(errorMessage);
                }
            } else if (error instanceof Error) {
                toast.error(error.message || errorMessage);
            } else {
                toast.error(errorMessage);
            }
            // Оставляем диалог открытым при ошибке
        }
    };

    // Подтверждение удаления (с API)
    const handleDeleteConfirm = async () => {
        if (!deletingUser) return;
        setIsDeleting(true);

        let errorMessage = "Не удалось удалить пользователя.";

        try {
            // Вызываем DELETE API
            await apiClient.delete(`/users/${deletingUser.id}`);
            toast.success(`Пользователь "${deletingUser.full_name}" удален.`);
            // Обновляем список локально
            setUsers(prev => prev.filter(u => u.id !== deletingUser.id));
            // await fetchData(); // Или перезагружаем

        } catch (error) {
            console.error("Ошибка удаления пользователя:", error);
            if (axios.isAxiosError(error) && error.response) {
                errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
                // Обработка конфликта (409) или запрета (403 - само удаление)
                if (error.response.status === 409 || error.response.status === 403) {
                    errorMessage = error.response.data?.error || errorMessage;
                }
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            toast.error(errorMessage);
        } finally {
            setIsDeleting(false);
            setIsDeleteDialogOpen(false);
            setDeletingUser(null);
        }
    };

    // Используем specialization_name, которое приходит от API GET /users
    const getSpecializationName = (specName?: string | null): string => {
        return specName ?? '-'; // Если имя пришло - показываем, иначе - прочерк
    };

    const selectedRoleInForm = form.watch('role');

    // --- Рендеринг ---
    if (isLoading) {
        return <div className="container mx-auto p-4">Загрузка данных...</div>;
    }
    if (error) {
        return <div className="container mx-auto p-4 text-red-500">{error}</div>;
    }

    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Управление Пользователями</h1>
                <Button variant="outline" asChild>
                    <Link to="/">Назад к панели</Link>
                </Button>
            </div>

            {/* Таблица пользователей */}
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader> <TableRow> <TableHead className="w-[50px]">ID</TableHead> <TableHead>Имя</TableHead> <TableHead>Email</TableHead> <TableHead>Телефон</TableHead> <TableHead>Роль</TableHead> <TableHead>Специализация</TableHead> <TableHead className="text-right w-[100px]">Действия</TableHead> </TableRow> </TableHeader>
                        <TableBody>
                            {users.length === 0 ? (
                                <TableRow> <TableCell colSpan={7} className="h-24 text-center">Пользователи не найдены.</TableCell> </TableRow>
                            ) : (
                                users.map((userItem) => (
                                    <TableRow key={userItem.id}>
                                        <TableCell className="font-mono text-xs">{userItem.id}</TableCell>
                                        <TableCell className="font-medium">{userItem.full_name}</TableCell>
                                        <TableCell>{userItem.email}</TableCell>
                                        <TableCell>{userItem.phone}</TableCell>
                                        <TableCell><Badge variant={userItem.role === 'admin' ? 'default' : userItem.role === 'doctor' ? 'secondary' : 'outline'}>{userItem.role}</Badge></TableCell>
                                        {/* Используем specialization_name из данных пользователя */}
                                        <TableCell>{getSpecializationName(userItem.specialization_name)}</TableCell>
                                        <TableCell className="text-right space-x-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(userItem)}> <Edit className="h-4 w-4" /> <span className="sr-only">Редактировать</span> </Button>
                                            <AlertDialog open={isDeleteDialogOpen && deletingUser?.id === userItem.id} onOpenChange={ (open) => {if(!open) setIsDeleteDialogOpen(false)} }>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive/80" onClick={() => handleDelete(userItem)} disabled={userItem.id === adminUser?.id || isDeleting}> <Trash2 className="h-4 w-4" /> <span className="sr-only">Удалить</span> </Button>
                                                </AlertDialogTrigger>
                                                {deletingUser?.id === userItem.id && (
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader> <AlertDialogTitle>Подтвердить удаление</AlertDialogTitle> <AlertDialogDescription> Вы уверены, что хотите удалить пользователя <span className="font-semibold">{deletingUser?.full_name}</span>? </AlertDialogDescription> </AlertDialogHeader>
                                                        <AlertDialogFooter> <AlertDialogCancel onClick={() => setDeletingUser(null)}>Отмена</AlertDialogCancel> <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"> {isDeleting ? 'Удаление...' : 'Удалить'} </AlertDialogAction> </AlertDialogFooter>
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

            {/* Диалог Редактирования Пользователя */}
            <Dialog open={isEditUserDialogOpen} onOpenChange={setIsEditUserDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader> <DialogTitle>Редактировать: {editingUser?.full_name}</DialogTitle> <DialogDescription>Измените роль и/или специализацию.</DialogDescription> </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onEditUserSubmit)} className="space-y-4 py-4">
                            <FormField control={form.control} name="role" render={({ field }) => (
                                <FormItem> <FormLabel>Роль *</FormLabel> <Select onValueChange={field.onChange} defaultValue={field.value}> <FormControl> <SelectTrigger> <SelectValue placeholder="Выберите роль..." /> </SelectTrigger> </FormControl> <SelectContent> <SelectItem value="patient">Patient</SelectItem> <SelectItem value="doctor">Doctor</SelectItem> <SelectItem value="admin">Admin</SelectItem> </SelectContent> </Select> <FormMessage /> </FormItem>
                            )}/>
                            {selectedRoleInForm === 'doctor' && (
                                <FormField control={form.control} name="specializationId" render={({ field }) => (
                                    <FormItem> <FormLabel>Специализация *</FormLabel> <Select onValueChange={field.onChange} defaultValue={field.value ?? ""}> <FormControl> <SelectTrigger> <SelectValue placeholder="Выберите специализацию..." /> </SelectTrigger> </FormControl> <SelectContent> {specializations.length === 0 && <SelectItem value="null" disabled>Нет доступных специализаций</SelectItem>} {specializations.map(spec => ( <SelectItem key={spec.id} value={spec.id.toString()}> {spec.name} </SelectItem> ))} </SelectContent> </Select> <FormMessage /> </FormItem>
                                )}/>
                            )}
                            <DialogFooter>
                                <DialogClose asChild> <Button type="button" variant="outline">Отмена</Button> </DialogClose>
                                <Button type="submit" disabled={isSubmitting}> {isSubmitting ? 'Сохранение...' : 'Сохранить'} </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Кнопка Назад */}
            <Button variant="outline" asChild className="mt-6">
                <Link to="/">Назад к панели</Link>
            </Button>
        </div>
    );
};

export default ManageUsersPage;