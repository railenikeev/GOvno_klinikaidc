// my-clinic-app/src/pages/ProfilePage.tsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import apiClient from '@/services/apiClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Toaster, toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"; // Добавили Form компоненты

// Схема валидации для формы профиля
const profileSchema = z.object({
    fullName: z.string().min(2, "Полное имя должно содержать не менее 2 символов"),
    email: z.string().email("Некорректный email"),
    phone: z.string().min(10, "Номер телефона должен содержать не менее 10 символов"),
    // Для смены пароля (опционально, можно вынести в отдельную форму/компонент)
    // currentPassword: z.string().optional().or(z.literal('')),
    // newPassword: z.string().optional().or(z.literal('')),
    // confirmNewPassword: z.string().optional().or(z.literal('')),
});
// .refine(data => {
//     if (data.newPassword && !data.currentPassword) {
//         // Если новый пароль введен, то и текущий должен быть введен
//         // Это правило можно добавить, если будете реализовывать смену пароля здесь же
//         // form.setError("currentPassword", { message: "Введите текущий пароль для смены."});
//         return false;
//     }
//     if (data.newPassword && data.newPassword !== data.confirmNewPassword) {
//         return false;
//     }
//     return true;
// }, {
//     message: "Новые пароли не совпадают или не введен текущий пароль",
//     path: ["confirmNewPassword"], // Ошибка будет показана у поля подтверждения
// });


type ProfileFormValues = z.infer<typeof profileSchema>;

interface UserProfileData {
    id: number; // Добавим ID, чтобы можно было отобразить
    full_name: string;
    email: string;
    phone: string;
    role: string; // Добавим роль для отображения
    specialization_name?: string | null; // Если это врач
}


const ProfilePage: React.FC = () => {
    const { user, token, updateUserAuthData } = useAuth(); // Используем updateUserAuthData для обновления контекста
    const [isLoading, setIsLoading] = useState(true); // Начинаем с true
    const [isSubmitting, setIsSubmitting] = useState(false);


    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            fullName: '',
            email: '',
            phone: '',
            // currentPassword: '',
            // newPassword: '',
            // confirmNewPassword: '',
        }
    });

    useEffect(() => {
        if (user) {
            const fetchUserData = async () => {
                setIsLoading(true);
                try {
                    // Запрашиваем свежие данные пользователя с бэкенда
                    const response = await apiClient.get<UserProfileData>('/me');
                    form.reset({
                        fullName: response.data.full_name,
                        email: response.data.email,
                        phone: response.data.phone,
                    });
                } catch (error) {
                    toast.error('Не удалось загрузить данные профиля.');
                    console.error("Ошибка загрузки данных профиля:", error);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchUserData();
        } else {
            setIsLoading(false); // Если пользователя нет, не грузим
        }
    }, [user, form]);

    const onSubmit = async (data: ProfileFormValues) => {
        setIsSubmitting(true);
        try {
            const payload: Partial<UserProfileData> = { // Partial т.к. id и role не отправляем на изменение
                full_name: data.fullName,
                email: data.email,
                phone: data.phone,
            };

            // TODO: Реализовать эндпоинт PUT /api/me или PATCH /api/me на бэкенде
            // для обновления `full_name`, `email`, `phone` пользователя.
            // Он должен быть доступен аутентифицированному пользователю для своего профиля.
            const response = await apiClient.put<UserProfileData>('/me', payload);

            toast.success('Профиль успешно обновлен!');

            // Обновляем данные в AuthContext и форме свежими данными с сервера
            if (response.data && token) {
                updateUserAuthData(response.data); // Обновляем контекст
                form.reset({ // Обновляем форму
                    fullName: response.data.full_name,
                    email: response.data.email,
                    phone: response.data.phone,
                });
            }

        } catch (error: any) {
            let errorMessage = 'Не удалось обновить профиль.';
            if (error.response && error.response.data && error.response.data.error) {
                errorMessage = error.response.data.error;
                // Пример обработки специфической ошибки от бэкенда (например, email занят)
                if (errorMessage.toLowerCase().includes("email")) {
                    form.setError("email", { type: "manual", message: errorMessage });
                } else if (errorMessage.toLowerCase().includes("телефон")) {
                    form.setError("phone", { type: "manual", message: errorMessage });
                }
            }
            toast.error(errorMessage);
            console.error("Ошибка обновления профиля:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return <div className="container mx-auto p-4">Загрузка данных профиля...</div>;
    }

    if (!user) { // Если после загрузки пользователя все еще нет
        return (
            <div className="container mx-auto p-4 text-red-500">
                Пользователь не авторизован. <Link to="/login" className="underline">Войти</Link>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Мой профиль</h1>
                <Button variant="outline" asChild>
                    <Link to="/">Назад к панели</Link>
                </Button>
            </div>

            <Card className="max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle>Редактирование профиля</CardTitle>
                    <CardDescription>
                        Здесь вы можете обновить вашу личную информацию.
                        <br />
                        <span className="text-xs text-muted-foreground">
                            ID: {user.id} | Роль: {user.role}
                            {user.role === 'doctor' && user.specialization_name && ` | Специализация: ${user.specialization_name}`}
                        </span>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="fullName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Полное имя</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Иванов Иван Иванович" {...field} disabled={isSubmitting} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input type="email" placeholder="you@example.com" {...field} disabled={isSubmitting} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="phone"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Телефон</FormLabel>
                                        <FormControl>
                                            <Input placeholder="+79001234567" {...field} disabled={isSubmitting} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Сюда можно добавить форму для смены пароля, если это будет один эндпоинт.
                                Если эндпоинт для смены пароля отдельный, лучше сделать отдельную секцию или компонент.
                            <hr className="my-6" />
                            <h3 className="text-lg font-medium">Сменить пароль</h3>
                             <FormField ... currentPassword ... />
                             <FormField ... newPassword ... />
                             <FormField ... confirmNewPassword ... />
                            */}

                            <Button type="submit" disabled={isSubmitting || isLoading} className="w-full">
                                {isSubmitting ? 'Сохранение...' : 'Сохранить изменения'}
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
};

export default ProfilePage;