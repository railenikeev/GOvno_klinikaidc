import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod'; // Библиотека для валидации схем
import { AxiosError } from 'axios'; // Тип ошибки axios
import { Toaster, toast } from "sonner"; // <-- Правильный импорт для sonner

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// Label импортируется из FormField ниже, отдельный импорт не нужен, если используем Form от shadcn
// import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from '@/contexts/AuthContext'; // Наш контекст аутентификации
import apiClient from '@/services/apiClient'; // Наш API клиент
// useToast не нужен, если используем sonner
// import { useToast } from "@/components/ui/use-toast";


// Схема валидации формы с использованием Zod
const loginSchema = z.object({
    email: z.string().email({ message: 'Введите корректный email' }),
    password: z.string().min(6, { message: 'Пароль должен быть не менее 6 символов' }),
});

// Выводим тип данных из схемы Zod
type LoginFormValues = z.infer<typeof loginSchema>;

const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { login } = useAuth(); // Получаем функцию login из контекста
    const [apiError, setApiError] = useState<string | null>(null); // Состояние для ошибок API
    // const { toast } = useToast(); // Убираем, т.к. используем sonner
    // Не нужно: const { toast } = sonner;

    // Настройка react-hook-form
    const form = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema), // Интеграция с Zod
        defaultValues: {
            email: '',
            password: '',
        },
    });

    // Функция обработки отправки формы
    const onSubmit = async (data: LoginFormValues) => {
        setApiError(null); // Сбрасываем предыдущие ошибки API
        console.log('Login form submitted:', data);

        try {
            const response = await apiClient.post('/login', data); // Отправляем запрос на бэкенд
            console.log('Login response:', response.data);

            if (response.data && response.data.token && response.data.user_id && response.data.role) {
                // --- Успешный вход ---
                const userData = {
                    id: response.data.user_id,
                    role: response.data.role,
                };
                login(response.data.token, userData); // Вызываем login из AuthContext
                toast.success("Вход выполнен успешно!"); // <-- Используем импортированный toast
                navigate('/', { replace: true }); // Перенаправляем на главную страницу
            } else {
                // Странный ответ от сервера
                throw new Error("Некорректный ответ от сервера");
            }

        } catch (error) {
            // --- Ошибка входа ---
            console.error('Login error:', error);
            let errorMessage = 'Произошла ошибка при входе. Попробуйте снова.';
            if (error instanceof AxiosError && error.response) {
                // Ошибка от бэкенда
                if (error.response.status === 401) {
                    errorMessage = 'Неверный email или пароль.';
                } else if (error.response.data && typeof error.response.data.error === 'string') {
                    // Используем сообщение об ошибке от бэкенда, если оно есть
                    errorMessage = error.response.data.error;
                }
            }
            setApiError(errorMessage);
            toast.error(errorMessage); // <-- Используем импортированный toast
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 px-4">
            {/* Добавляем Toaster для sonner один раз */}
            <Toaster position="top-center" richColors closeButton />
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl font-bold">Вход в систему</CardTitle>
                    <CardDescription>Введите ваш email и пароль для доступа</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}> {/* Передаем методы формы из react-hook-form */}
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            {/* Поле Email */}
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input placeholder="you@example.com" {...field} />
                                        </FormControl>
                                        <FormMessage /> {/* Сообщение об ошибке валидации */}
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

                            {/* Отображение ошибки API */}
                            {apiError && (
                                <p className="text-sm font-medium text-destructive">{apiError}</p>
                            )}

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={form.formState.isSubmitting} // Деактивируем кнопку во время отправки
                            >
                                {form.formState.isSubmitting ? 'Вход...' : 'Войти'}
                            </Button>
                        </form>
                    </Form>
                </CardContent>
                <CardFooter className="flex flex-col items-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                        Еще нет аккаунта?{' '}
                        <Link to="/register" className="font-medium text-primary underline underline-offset-4 hover:text-primary/80">
                            Зарегистрироваться
                        </Link>
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
};

export default LoginPage;