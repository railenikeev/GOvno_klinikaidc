import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { AxiosError } from 'axios';
import { Toaster, toast } from "sonner";

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from '@/contexts/AuthContext';
import apiClient from '@/services/apiClient';


const loginSchema = z.object({
    email: z.string().email({ message: 'Введите корректный email' }),
    password: z.string().min(6, { message: 'Пароль должен быть не менее 6 символов' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [apiError, setApiError] = useState<string | null>(null);

    const form = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: '',
            password: '',
        },
    });

    const onSubmit = async (data: LoginFormValues) => {
        setApiError(null);
        console.log('Login form submitted:', data);

        try {
            const response = await apiClient.post('/login', data);
            console.log('Login response:', response.data);

            if (response.data && response.data.token && response.data.user_id && response.data.role) {
                const userData = {
                    id: response.data.user_id,
                    role: response.data.role,
                };
                login(response.data.token, userData);
                toast.success("Вход выполнен успешно!");
                navigate('/', { replace: true });
            } else {
                throw new Error("Некорректный ответ от сервера");
            }

        } catch (error) {
            console.error('Login error:', error);
            let errorMessage = 'Произошла ошибка при входе. Попробуйте снова.';
            if (error instanceof AxiosError && error.response) {
                if (error.response.status === 401) {
                    errorMessage = 'Неверный email или пароль.';
                } else if (error.response.data && typeof error.response.data.error === 'string') {
                    errorMessage = error.response.data.error;
                }
            }
            setApiError(errorMessage);
            toast.error(errorMessage);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 px-4">
            {}
            <Toaster position="top-center" richColors closeButton />
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl font-bold">Вход в систему</CardTitle>
                    <CardDescription>Введите ваш email и пароль для доступа</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}> {}
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            {}
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input placeholder="you@example.com" {...field} />
                                        </FormControl>
                                        <FormMessage /> {}
                                    </FormItem>
                                )}
                            />
                            {}
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

                            {}
                            {apiError && (
                                <p className="text-sm font-medium text-destructive">{apiError}</p>
                            )}

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={form.formState.isSubmitting}
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