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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const profileSchema = z.object({
    fullName: z.string().min(2, "Полное имя должно содержать не менее 2 символов"),
    email: z.string().email("Некорректный email"),
    phone: z.string().min(10, "Номер телефона должен содержать не менее 10 символов"),
});


type ProfileFormValues = z.infer<typeof profileSchema>;

interface UserProfileData {
    id: number;
    full_name: string;
    email: string;
    phone: string;
    role: string;
    specialization_name?: string | null;
}


const ProfilePage: React.FC = () => {
    const { user, token, updateUserAuthData } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);


    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            fullName: '',
            email: '',
            phone: '',
        }
    });

    useEffect(() => {
        if (user) {
            const fetchUserData = async () => {
                setIsLoading(true);
                try {
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
            setIsLoading(false);
        }
    }, [user, form]);

    const onSubmit = async (data: ProfileFormValues) => {
        setIsSubmitting(true);
        try {
            const payload: Partial<UserProfileData> = {
                full_name: data.fullName,
                email: data.email,
                phone: data.phone,
            };

            const response = await apiClient.put<UserProfileData>('/me', payload);

            toast.success('Профиль успешно обновлен!');

            if (response.data && token) {
                updateUserAuthData(response.data);
                form.reset({
                    fullName: response.data.full_name,
                    email: response.data.email,
                    phone: response.data.phone,
                });
            }

        } catch (error: any) {
            let errorMessage = 'Не удалось обновить профиль.';
            if (error.response && error.response.data && error.response.data.error) {
                errorMessage = error.response.data.error;
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

    if (!user) {
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

                            {}

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