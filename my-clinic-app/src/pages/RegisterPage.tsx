import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { AxiosError } from 'axios';
import { Toaster, toast } from "sonner"; // Правильный импорт

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import apiClient from '@/services/apiClient';

// Схема валидации формы регистрации
const registerSchema = z.object({
    fullName: z.string().min(2, { message: 'Имя должно содержать не менее 2 символов' }),
    email: z.string().email({ message: 'Введите корректный email' }),
    phone: z.string().min(10, { message: 'Введите корректный номер телефона' }),
    password: z.string().min(6, { message: 'Пароль должен быть не менее 6 символов' }),
    confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
});

// Тип данных формы
type RegisterFormValues = z.infer<typeof registerSchema>;

const RegisterPage: React.FC = () => {
    const navigate = useNavigate();
    const [apiError, setApiError] = useState<string | null>(null);

    const form = useForm<RegisterFormValues>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            fullName: '',
            email: '',
            phone: '',
            password: '',
            confirmPassword: '',
        },
    });

    // Обработчик отправки формы
    const onSubmit = async (data: RegisterFormValues) => {
        setApiError(null); // Сбрасываем предыдущие ошибки API (использование void здесь нормально)
        // Удален console.log, который мог вызывать предупреждение TS6133 (Void function return value is used)

        // Подготовка данных для API
        const payload = {
            full_name: data.fullName,
            email: data.email,
            phone: data.phone,
            password: data.password,
            role: 'patient', // Регистрируем только пациентов
            specialization_id: null
        };

        let errorMessage = 'Произошла ошибка при регистрации. Попробуйте снова.'; // Объявляем заранее

        try {
            const response = await apiClient.post('/register', payload);
            console.log('Register response:', response.data); // Лог ответа оставим для отладки

            if (response.status === 201 && response.data.message) {
                // --- Успешная регистрация ---
                toast.success(response.data.message + " Теперь вы можете войти.");
                navigate('/login'); // Перенаправляем на страницу входа
                return; // Выходим из функции после успешной обработки
            } else {
                // --- Неожиданный успешный ответ ---
                console.error('Registration error: Invalid server response format', response);
                errorMessage = "Неожиданный ответ от сервера при регистрации.";
                // Не используем throw, обработаем ниже
            }

        } catch (error) {
            // --- Ошибка API или сети ---
            console.error('Registration error:', error);
            if (error instanceof AxiosError && error.response) {
                // Ошибка от бэкенда со статусом
                if (error.response.status === 409) { // Conflict
                    errorMessage = error.response.data?.error || 'Пользователь с таким email или телефоном уже существует.';
                } else if (error.response.data && typeof error.response.data.error === 'string') {
                    // Используем сообщение об ошибке от бэкенда
                    errorMessage = error.response.data.error;
                } else {
                    // Другая ошибка сервера (5xx и т.д.)
                    errorMessage = `Ошибка сервера (${error.response.status}). Попробуйте позже.`;
                }
            } else {
                // Ошибка сети или другая непредвиденная ошибка axios/javascript
                errorMessage = 'Не удалось подключиться к серверу. Проверьте ваше соединение.';
            }
        }

        // Установка и показ ошибки (если она произошла в try или catch)
        setApiError(errorMessage);
        toast.error(errorMessage);
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 px-4 py-8">
            {/* Toaster для sonner */}
            <Toaster position="top-center" richColors closeButton />
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl font-bold">Регистрация</CardTitle>
                    <CardDescription>Создайте новый аккаунт</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            {/* Поле Full Name */}
                            <FormField
                                control={form.control}
                                name="fullName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Полное имя</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Иванов Иван Иванович" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {/* Поле Email */}
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input type="email" placeholder="you@example.com" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {/* Поле Phone */}
                            <FormField
                                control={form.control}
                                name="phone"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Телефон</FormLabel>
                                        <FormControl>
                                            <Input placeholder="+79xxxxxxxxx" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {/* Поле Пароль */}
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Пароль</FormLabel>
                                        <FormControl>
                                            <Input type="password" placeholder="******" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {/* Поле Подтверждение Пароля */}
                            <FormField
                                control={form.control}
                                name="confirmPassword"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Подтвердите пароль</FormLabel>
                                        <FormControl>
                                            <Input type="password" placeholder="******" {...field} />
                                        </FormControl>
                                        <FormMessage /> {/* Сюда попадет ошибка о несовпадении паролей */}
                                    </FormItem>
                                )}
                            />

                            {/* Отображение ошибки API */}
                            {apiError && (
                                <p className="text-sm font-medium text-destructive">{apiError}</p>
                            )}

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={form.formState.isSubmitting}
                            >
                                {form.formState.isSubmitting ? 'Регистрация...' : 'Зарегистрироваться'}
                            </Button>
                        </form>
                    </Form>
                </CardContent>
                <CardFooter className="flex flex-col items-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                        Уже есть аккаунт?{' '}
                        <Link to="/login" className="font-medium text-primary underline underline-offset-4 hover:text-primary/80">
                            Войти
                        </Link>
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
};

export default RegisterPage;