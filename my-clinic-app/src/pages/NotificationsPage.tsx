import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Check } from "lucide-react";

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Toaster, toast } from "sonner";
import { cn } from "@/lib/utils";

interface NotificationEntry {
    id: number;
    user_id: number;
    channel: string;
    message: string;
    sent_at: string;
    is_read: boolean;
}


const NotificationsPage: React.FC = () => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [markingReadId, setMarkingReadId] = useState<number | null>(null);

    const fetchNotifications = useCallback(async () => {
        if (isLoading && notifications.length === 0) return;

        setIsLoading(true);
        setError(null);
        try {
            const response = await apiClient.get<NotificationEntry[]>('/notify');
            setNotifications(response.data);
        } catch (err) {
            console.error("Ошибка загрузки уведомлений:", err);
            setError("Не удалось загрузить уведомления.");
            toast.error("Не удалось загрузить уведомления.");
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, notifications.length]);

    useEffect(() => {
        if (user) {
            fetchNotifications().catch(console.error);
        } else if (!isLoading) {
            setError("Пользователь не авторизован.");
            setIsLoading(false);
        }
    }, [user, fetchNotifications, isLoading]);

    const handleMarkAsRead = async (notificationId: number) => {
        if (markingReadId) return;
        setMarkingReadId(notificationId);
        try {
            await apiClient.patch(`/notify/${notificationId}/read`);
            setNotifications(prev =>
                prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
            );
        } catch (error) {
            console.error("Ошибка при пометке уведомления прочитанным:", error);
            toast.error("Не удалось обновить статус уведомления.");
        } finally {
            setMarkingReadId(null);
        }
    };

    if (isLoading && notifications.length === 0) {
        return <div className="container mx-auto p-4">Загрузка уведомлений...</div>;
    }

    if (error) {
        return <div className="container mx-auto p-4 text-red-500">{error}</div>;
    }

    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <h1 className="text-2xl font-bold mb-6">Уведомления</h1>

            {notifications.length === 0 ? (
                <p>У вас пока нет уведомлений.</p>
            ) : (
                <div className="space-y-3">
                    {notifications.map((notification) => (
                        <Card
                            key={notification.id}
                            className={cn(
                                "flex items-center justify-between p-4",
                                notification.is_read ? "bg-card/50 opacity-70" : "bg-card"
                            )}
                        >
                            <div className="flex-grow mr-4">
                                <p className={cn("text-sm", !notification.is_read && "font-medium")}>
                                    {notification.message}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {formatDistanceToNow(parseISO(notification.sent_at), { addSuffix: true, locale: ru })}
                                    <span className="mx-1">·</span>
                                    Канал: {notification.channel}
                                </p>
                            </div>
                            {!notification.is_read && (
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => handleMarkAsRead(notification.id)}
                                    disabled={markingReadId === notification.id}
                                    aria-label="Пометить как прочитанное"
                                >
                                    {markingReadId === notification.id ? (
                                        <span className="animate-spin text-xs">...</span>
                                    ) : (
                                        <Check className="h-4 w-4" />
                                    )}
                                </Button>
                            )}
                        </Card>
                    ))}
                </div>
            )}
            <Button variant="outline" asChild className="mt-6">
                <Link to="/">Назад к панели</Link>
            </Button>
        </div>
    );
};

export default NotificationsPage;