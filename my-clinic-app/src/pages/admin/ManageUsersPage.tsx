import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Edit, Trash2 } from 'lucide-react'; // Иконки для кнопок

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Select для роли/специализации
import { Toaster, toast } from "sonner";
import { useAuth } from '@/contexts/AuthContext'; // Чтобы не удалить самого себя

// --- Типы и Mock Данные ---
interface Specialization {
    id: number;
    name: string;
}
const MOCK_SPECIALIZATIONS: Specialization[] = [
    { id: 1, name: 'Терапевт' }, { id: 2, name: 'Кардиолог' },
    { id: 3, name: 'Невролог' }, { id: 4, name: 'Окулист' },
];

interface UserAdminView {
    id: number;
    full_name: string;
    email: string;
    phone: string;
    role: 'patient' | 'doctor' | 'admin';
    specialization_id?: number | null;
}
const MOCK_USERS_DATA: UserAdminView[] = [
    { id: 1, full_name: 'Администратор Первый', email: 'admin@example.com', phone: '111111', role: 'admin' },
    { id: 2, full_name: 'Доктор Петров В.А.', email: 'petrov@example.com', phone: '222222', role: 'doctor', specialization_id: 1 },
    { id: 3, full_name: 'Пациент Андреев А.А.', email: 'andreev@example.com', phone: '333333', role: 'patient' },
    { id: 4, full_name: 'Доктор Сидорова Е.П.', email: 'sidorova@example.com', phone: '444444', role: 'doctor', specialization_id: 2 },
    { id: 5, full_name: 'Доктор Иванов И.И.', email: 'ivanov@example.com', phone: '555555', role: 'doctor', specialization_id: 3 },
    { id: 6, full_name: 'Пациентка Белова О.О.', email: 'belova@example.com', phone: '666666', role: 'patient' },
];
// --- Конец Mock Данных ---

// Схема для формы редактирования пользователя
const userEditSchema = z.object({
    // Пока разрешим менять только роль и специализацию
    role: z.enum(['patient', 'doctor', 'admin'], { required_error: "Выберите роль" }),
    // specialization_id делаем строкой из Select, потом преобразуем в число или null
    specializationId: z.string().optional(),
    // Можно добавить и другие поля: fullName, phone...
});
type UserEditFormValues = z.infer<typeof userEditSchema>;


const ManageUsersPage: React.FC = () => {
    const { user: adminUser } = useAuth(); // Текущий админ
    const [users, setUsers] = useState<UserAdminView[]>(MOCK_USERS_DATA);
    const [specializations] = useState<Specialization[]>(MOCK_SPECIALIZATIONS); // Для <Select>

    const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserAdminView | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingUser, setDeletingUser] = useState<UserAdminView | null>(null);

    // Форма редактирования
    const form = useForm<UserEditFormValues>({
        resolver: zodResolver(userEditSchema),
    });

    // Открытие диалога редактирования
    const handleEdit = (userToEdit: UserAdminView) => {
        setEditingUser(userToEdit);
        form.reset({ // Заполняем форму текущими данными
            role: userToEdit.role,
            // Преобразуем ID специализации в строку для Select, или пустую строку если null/undefined
            specializationId: userToEdit.specialization_id?.toString() ?? "",
        });
        setIsEditUserDialogOpen(true);
    };

    // Открытие диалога удаления
    const handleDelete = (userToDelete: UserAdminView) => {
        if (userToDelete.id === adminUser?.id) {
            toast.error("Нельзя удалить самого себя.");
            return;
        }
        setDeletingUser(userToDelete);
        setIsDeleteDialogOpen(true);
    };

    // Сохранение изменений пользователя (имитация)
    const onEditUserSubmit = (data: UserEditFormValues) => {
        if (!editingUser) return;

        const updatedUser: UserAdminView = {
            ...editingUser,
            role: data.role,
            // Преобразуем строку specializationId обратно в число или null
            specialization_id: data.role === 'doctor' && data.specializationId ? parseInt(data.specializationId, 10) : null,
        };

        // Если роль сменили на не-врача, обнуляем специализацию
        if (updatedUser.role !== 'doctor') {
            updatedUser.specialization_id = null;
        }
        // Если роль стала врач, но специализация не выбрана (хотя форма должна требовать)
        if (updatedUser.role === 'doctor' && !updatedUser.specialization_id) {
            toast.error("Для роли 'Врач' необходимо выбрать специализацию.");
            return; // Прерываем сохранение
        }


        console.log("Обновление пользователя (имитация):", updatedUser);
        // Имитация API вызова
        try {
            setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
            toast.success(`Данные пользователя "${updatedUser.full_name}" обновлены.`);
            setIsEditUserDialogOpen(false);
            setEditingUser(null);
        } catch (error) {
            toast.error("Ошибка при обновлении пользователя.");
            console.error("Ошибка обновления:", error);
        }
    };

    // Подтверждение удаления (имитация)
    const handleDeleteConfirm = () => {
        if (!deletingUser) return;
        console.log("Удаление пользователя (имитация):", deletingUser);
        // Имитация API вызова
        try {
            setUsers(prev => prev.filter(u => u.id !== deletingUser.id));
            toast.success(`Пользователь "${deletingUser.full_name}" удален.`);
            setIsDeleteDialogOpen(false);
            setDeletingUser(null);
        } catch (error) {
            toast.error("Ошибка при удалении пользователя.");
            console.error("Ошибка удаления:", error);
        }
    };

    // Получаем имя специализации по ID для отображения в таблице
    const getSpecializationName = (id?: number | null): string => {
        if (!id) return '-';
        return specializations.find(s => s.id === id)?.name ?? 'Неизвестно';
    };

    // Наблюдаем за выбранной ролью в форме, чтобы показать/скрыть выбор специализации
    const selectedRoleInForm = form.watch('role');

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
                                        <TableCell>{getSpecializationName(userItem.specialization_id)}</TableCell>
                                        <TableCell className="text-right space-x-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(userItem)}>
                                                <Edit className="h-4 w-4" />
                                                <span className="sr-only">Редактировать</span>
                                            </Button>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive/80" onClick={() => handleDelete(userItem)} disabled={userItem.id === adminUser?.id}> {/* Не даем удалить себя */}
                                                        <Trash2 className="h-4 w-4" />
                                                        <span className="sr-only">Удалить</span>
                                                    </Button>
                                                </AlertDialogTrigger>
                                                {/* Диалог рендерится только когда открыт */}
                                                {isDeleteDialogOpen && deletingUser?.id === userItem.id && (
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Подтвердить удаление</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Вы уверены, что хотите удалить пользователя <span className="font-semibold">{deletingUser?.full_name}</span>?
                                                                Это действие необратимо.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel onClick={() => setDeletingUser(null)}>Отмена</AlertDialogCancel>
                                                            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                                Удалить
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
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
                    <DialogHeader>
                        <DialogTitle>Редактировать пользователя: {editingUser?.full_name}</DialogTitle>
                        <DialogDescription>Измените роль и/или специализацию.</DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onEditUserSubmit)} className="space-y-4 py-4">
                            {/* Выбор Роли */}
                            <FormField
                                control={form.control}
                                name="role"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Роль</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Выберите роль..." />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="patient">Patient</SelectItem>
                                                <SelectItem value="doctor">Doctor</SelectItem>
                                                <SelectItem value="admin">Admin</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {/* Выбор Специализации (только если выбрана роль doctor) */}
                            {selectedRoleInForm === 'doctor' && (
                                <FormField
                                    control={form.control}
                                    name="specializationId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Специализация *</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Выберите специализацию..." />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {specializations.map(spec => (
                                                        <SelectItem key={spec.id} value={spec.id.toString()}>
                                                            {spec.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

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
    );
};

export default ManageUsersPage;