import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
// Удалили CardHeader, CardTitle
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";

// Тип для платежа (из ответа GET /payments)
interface PaymentEntry {
    id: number;
    appointment_id: number;
    amount: number;
    payment_date?: string | null;
    payment_status: string;
    // Дополнительная информация из связанных таблиц (полученная через JOIN в бэкенде)
    patient_id?: number | null;
    patient_name?: string | null;
    doctor_id?: number | null;
    doctor_name?: string | null;
}

// Функция для определения варианта Badge по статусу платежа
const getPaymentStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status?.toLowerCase()) {
        case 'paid': return 'default';
        case 'pending': return 'secondary';
        case 'failed': return 'destructive';
        default: return 'outline';
    }
};

// Функция для форматирования суммы
const formatCurrency = (amount: number | null | undefined): string => {
    if (amount == null) return 'N/A';
    return `${amount.toFixed(2)} руб.`;
};


const MyPaymentsPage: React.FC = () => {
    const { user } = useAuth();
    const [payments, setPayments] = useState<PaymentEntry[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Загрузка истории платежей
    useEffect(() => {
        if (!user || user.role !== 'patient') {
            setError("Доступ запрещен или пользователь не авторизован.");
            setIsLoading(false);
            return;
        }

        const fetchPayments = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await apiClient.get<PaymentEntry[]>('/payments');
                setPayments(response.data);
            } catch (err) {
                console.error("Ошибка загрузки платежей:", err);
                setError("Не удалось загрузить историю платежей.");
                toast.error("Не удалось загрузить историю платежей.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchPayments().catch(console.error);

    }, [user]);

    // --- Рендеринг ---
    if (isLoading) {
        return <div className="container mx-auto p-4">Загрузка платежей...</div>;
    }

    if (error) {
        return <div className="container mx-auto p-4 text-red-500">{error}</div>;
    }

    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <h1 className="text-2xl font-bold mb-6">Мои платежи</h1>

            {payments.length === 0 ? (
                <p>У вас пока нет информации о платежах.</p>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>ID Платежа</TableHead>
                                    <TableHead>Дата платежа</TableHead>
                                    <TableHead>Сумма</TableHead>
                                    <TableHead>Статус</TableHead>
                                    <TableHead>ID Записи</TableHead>
                                    {/* Можно будет добавить колонку Врач/Дата приема, если доработать JOIN в бэкенде */}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payments.map((payment) => (
                                    <TableRow key={payment.id}>
                                        <TableCell className="font-mono text-xs">{payment.id}</TableCell>
                                        <TableCell>
                                            {payment.payment_date
                                                ? format(parseISO(payment.payment_date), 'dd.MM.yyyy HH:mm', { locale: ru })
                                                : '-'}
                                        </TableCell>
                                        <TableCell className="font-medium">{formatCurrency(payment.amount)}</TableCell>
                                        <TableCell>
                                            <Badge variant={getPaymentStatusVariant(payment.payment_status)}>
                                                {payment.payment_status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{payment.appointment_id}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
            <Button variant="outline" asChild className="mt-6">
                <Link to="/">Назад к панели</Link>
            </Button>
        </div>
    );
};

export default MyPaymentsPage;