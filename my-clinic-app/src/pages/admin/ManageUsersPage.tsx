// my-clinic-app/src/pages/admin/ManageUsersPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Edit, Trash2 } from 'lucide-react';
import axios from 'axios';

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster, toast } from "sonner";

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
    specialization_name?: string | null;
}

// Объект для перевода ролей
const roleTranslations: { [key: string]: string } = {
    patient: 'Пациент',
    doctor: 'Врач',
    admin: 'Администратор',
};

const userEditSchema = z.object({
    role: z.enum(['patient', 'doctor', 'admin'], { required_error: "Выберите роль" }),
    specializationId: z.string().optional(),
}).refine(data => {
    if (data.role === 'doctor') {
        return data.specializationId && data.specializationId !== "";
    }
    return true;
}, { message: `Для роли '${roleTranslations.doctor || 'Врач'}' необходимо выбрать специализацию.`, path: ["specializationId"] }); // Используем перевод

type UserEditFormValues = z.infer<typeof userEditSchema>;

const ManageUsersPage: React.FC = () => {
    const { user: adminUser } = useAuth();
    const [users, setUsers] = useState<UserAdminView[]>([]);
    const [specializations, setSpecializations] = useState<Specialization[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserAdminView | null>(null);

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingUser, setDeletingUser] = useState<UserAdminView | null>(null);

    const [isSubmittingOperation, setIsSubmittingOperation] = useState<boolean>(false);

    const editForm = useForm<UserEditFormValues>({
        resolver: zodResolver(userEditSchema),
        defaultValues: { role: 'patient', specializationId: "" }
    });
    const watchedRoleInEditForm = editForm.watch('role');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [usersResponse, specsResponse] = await Promise.all([
                apiClient.get<UserAdminView[]>('/users'),
                apiClient.get<Specialization[]>('/specializations')
            ]);
            usersResponse.data.sort((a, b) => a.full_name.localeCompare(b.full_name));
            setUsers(usersResponse.data || []);
            setSpecializations(specsResponse.data || []);
        } catch (err: any) {
            console.error("Ошибка загрузки данных:", err);
            const message = "Не удалось загрузить данные пользователей или специализаций.";
            setError(message);
            toast.error(message);
            setUsers([]);
            setSpecializations([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleEdit = (userToEdit: UserAdminView) => {
        setEditingUser(userToEdit);
        editForm.reset({
            role: userToEdit.role,
            specializationId: userToEdit.specialization_id?.toString() ?? "",
        });
        setIsEditUserDialogOpen(true);
    };

    const handleDelete = (userToDelete: UserAdminView) => {
        if (userToDelete.id === adminUser?.id) {
            toast.error("Нельзя удалить свой собственный аккаунт.");
            return;
        }
        setDeletingUser(userToDelete);
        setIsDeleteDialogOpen(true);
    };

    const onEditUserSubmit = async (data: UserEditFormValues) => {
        if (!editingUser) return;
        setIsSubmittingOperation(true);

        let specId: number | null = null;
        if (data.role === 'doctor') {
            if (data.specializationId && data.specializationId !== "") {
                specId = parseInt(data.specializationId, 10);
                if (isNaN(specId)) {
                    editForm.setError("specializationId", { type: "manual", message: "Выбрана некорректная специализация." });
                    setIsSubmittingOperation(false);
                    return;
                }
            } else {
                editForm.setError("specializationId", { type: "manual", message: `Для роли '${roleTranslations.doctor || 'Врач'}' необходимо выбрать специализацию.` }); // Используем перевод
                setIsSubmittingOperation(false);
                return;
            }
        }

        const payload = {
            role: data.role,
            specialization_id: specId,
        };
        let toastMessage = "Не удалось обновить пользователя.";

        try {
            await apiClient.patch(`/users/${editingUser.id}`, payload);
            toast.success(`Данные пользователя "${editingUser.full_name}" обновлены.`);
            setIsEditUserDialogOpen(false);
            setEditingUser(null);
            await fetchData();
        } catch (error: any) {
            console.error("Ошибка обновления пользователя:", error);
            if (axios.isAxiosError(error) && error.response) {
                toastMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
                if (error.response.status === 400 && error.response.data?.error?.toLowerCase().includes("специализация")) {
                    editForm.setError("specializationId", { type: "manual", message: error.response.data.error });
                } else {
                    toast.error(toastMessage);
                }
            } else if (error instanceof Error) {
                toastMessage = error.message || toastMessage;
                toast.error(toastMessage);
            } else {
                toast.error(toastMessage);
            }
        } finally {
            setIsSubmittingOperation(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deletingUser) return;
        setIsSubmittingOperation(true);
        setIsDeleteDialogOpen(false);
        let errorMessage = "Не удалось удалить пользователя.";
        try {
            await apiClient.delete(`/users/${deletingUser.id}`);
            toast.success(`Пользователь "${deletingUser.full_name}" удален.`);
            await fetchData();
        } catch (error: any) {
            console.error("Ошибка удаления пользователя:", error);
            if (axios.isAxiosError(error) && error.response) {
                errorMessage = error.response.data?.error || `Ошибка сервера (${error.response.status})`;
                if (error.response.status === 409 || error.response.status === 403) {
                    errorMessage = error.response.data?.error || errorMessage;
                }
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            toast.error(errorMessage);
        } finally {
            setIsSubmittingOperation(false);
            setDeletingUser(null);
        }
    };

    const getRoleBadgeVariant = (role: string): "default" | "secondary" | "outline" | "destructive" => {
        switch (role) {
            case 'admin': return 'destructive';
            case 'doctor': return 'default';
            case 'patient': return 'secondary';
            default: return 'outline';
        }
    };

    const renderTableContent = () => {
        if (isLoading) {
            return (
                <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">Загрузка пользователей...</TableCell>
                </TableRow>
            );
        }
        if (error && users.length === 0) {
            return (
                <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-red-500">{error}</TableCell>
                </TableRow>
            );
        }
        if (!isLoading && users.length === 0 && !error) {
            return (
                <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">Пользователи не найдены.</TableCell>
                </TableRow>
            );
        }

        return users.map((userItem) => (
            <TableRow key={userItem.id}>
                <TableCell className="font-mono text-xs">{userItem.id}</TableCell>
                <TableCell className="font-medium">{userItem.full_name}</TableCell>
                <TableCell>{userItem.email}</TableCell>
                <TableCell>{userItem.phone}</TableCell>
                <TableCell>
                    <Badge variant={getRoleBadgeVariant(userItem.role)}>
                        {roleTranslations[userItem.role] || userItem.role}
                    </Badge>
                </TableCell>
                <TableCell>{userItem.specialization_name ?? (userItem.role === 'doctor' ? 'Не указана' : '-')}</TableCell>
                <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(userItem)} disabled={isSubmittingOperation}>
                        <Edit className="h-4 w-4" /> <span className="sr-only">Редактировать</span>
                    </Button>
                    <AlertDialog
                        open={isDeleteDialogOpen && deletingUser?.id === userItem.id}
                        onOpenChange={(open) => {
                            if (!open) {
                                setIsDeleteDialogOpen(false);
                                setDeletingUser(null);
                            } else {
                                if (!deletingUser && open) setDeletingUser(userItem)
                            }
                        }}
                    >
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive/80"
                                onClick={() => handleDelete(userItem)}
                                disabled={userItem.id === adminUser?.id || isSubmittingOperation}
                            >
                                <Trash2 className="h-4 w-4" /> <span className="sr-only">Удалить</span>
                            </Button>
                        </AlertDialogTrigger>
                        {deletingUser?.id === userItem.id && (
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Подтвердить удаление</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Вы уверены, что хотите удалить пользователя <span className="font-semibold">{deletingUser?.full_name}</span> (Email: {deletingUser?.email})?
                                        Это действие необратимо.
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
                <h1 className="text-2xl font-bold">Управление Пользователями</h1>
                <Button variant="outline" asChild>
                    <Link to="/">Назад к панели</Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Список пользователей</CardTitle>
                    <CardDescription>Просмотр и редактирование ролей и специализаций пользователей.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]">ID</TableHead>
                                <TableHead>Имя</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Телефон</TableHead>
                                <TableHead>Роль</TableHead>
                                <TableHead>Специализация</TableHead>
                                <TableHead className="text-right w-[100px]">Действия</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {renderTableContent()}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isEditUserDialogOpen} onOpenChange={(isOpen) => {
                setIsEditUserDialogOpen(isOpen);
                if (!isOpen) setEditingUser(null);
            }}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Редактировать: {editingUser?.full_name}</DialogTitle>
                        <DialogDescription>Измените роль и/или специализацию пользователя.</DialogDescription>
                    </DialogHeader>
                    {editingUser && (
                        <Form {...editForm}>
                            <form onSubmit={editForm.handleSubmit(onEditUserSubmit)} className="space-y-4 py-4">
                                <FormField
                                    control={editForm.control}
                                    name="role"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Роль *</FormLabel>
                                            <Select
                                                onValueChange={field.onChange}
                                                value={field.value}
                                                disabled={isSubmittingOperation || (editingUser?.id === adminUser?.id && editingUser?.role === 'admin')}
                                            >
                                                <FormControl>
                                                    <SelectTrigger><SelectValue placeholder="Выберите роль..." /></SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="patient">{roleTranslations.patient}</SelectItem>
                                                    <SelectItem value="doctor">{roleTranslations.doctor}</SelectItem>
                                                    <SelectItem value="admin" disabled={editingUser?.id === adminUser?.id && editingUser?.role !== 'admin'}>{roleTranslations.admin}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )} />

                                {watchedRoleInEditForm === 'doctor' && (
                                    <FormField
                                        control={editForm.control}
                                        name="specializationId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Специализация *</FormLabel>
                                                <Select
                                                    onValueChange={field.onChange}
                                                    value={field.value}
                                                    disabled={isSubmittingOperation}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Выберите специализацию..." />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {specializations.length === 0 ? (
                                                            <SelectItem value="no-specs" disabled>Нет доступных специализаций</SelectItem>
                                                        ) : (
                                                            specializations.map(spec => (
                                                                <SelectItem key={spec.id} value={spec.id.toString()}>
                                                                    {spec.name}
                                                                </SelectItem>
                                                            ))
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                )}
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button type="button" variant="outline" disabled={isSubmittingOperation}>Отмена</Button>
                                    </DialogClose>
                                    <Button type="submit" disabled={isSubmittingOperation || editForm.formState.isSubmitting}>
                                        {isSubmittingOperation ? 'Сохранение...' : 'Сохранить'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ManageUsersPage;