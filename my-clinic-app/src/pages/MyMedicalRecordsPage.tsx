import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'; // Card для общего контейнера
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"; // Компоненты аккордеона
import { Toaster, toast } from "sonner";

// Тип для записей медкарты (из ответа GET /records)
interface MedicalRecordEntry {
    id: number;
    patient_id: number;
    doctor_id: number;
    appointment_id: number;
    diagnosis?: string | null; // Может быть null
    treatment?: string | null; // Может быть null
    visit_date: string; // Формат YYYY-MM-DD
    patient_name?: string | null; // Добавлено JOIN'ом в бэкенде
    doctor_name?: string | null; // Добавлено JOIN'ом в бэкенде
}


const MyMedicalRecordsPage: React.FC = () => {
    const { user } = useAuth();
    const [records, setRecords] = useState<MedicalRecordEntry[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Загрузка записей медкарты
    useEffect(() => {
        if (!user || user.role !== 'patient') {
            setError("Доступ запрещен или пользователь не авторизован.");
            setIsLoading(false);
            return;
        }

        const fetchMedicalRecords = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // Бэкенд сам фильтрует по patient_id из заголовка X-User-ID
                const response = await apiClient.get<MedicalRecordEntry[]>('/medical_records');
                setRecords(response.data);
            } catch (err) {
                console.error("Ошибка загрузки медкарты:", err);
                setError("Не удалось загрузить медицинские записи.");
                toast.error("Не удалось загрузить медицинские записи.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchMedicalRecords().catch(console.error);

    }, [user]);

    // --- Рендеринг ---
    if (isLoading) {
        return <div className="container mx-auto p-4">Загрузка медкарты...</div>;
    }

    if (error) {
        return <div className="container mx-auto p-4 text-red-500">{error}</div>;
    }

    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <h1 className="text-2xl font-bold mb-6">Моя медкарта</h1>

            {records.length === 0 ? (
                <p>У вас пока нет записей в медицинской карте.</p>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>История визитов</CardTitle>
                        <CardDescription>Здесь отображены записи о ваших посещениях врача.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Accordion type="single" collapsible className="w-full">
                            {records.map((record) => (
                                <AccordionItem value={`item-${record.id}`} key={record.id}>
                                    <AccordionTrigger>
                                        <div className="flex justify-between w-full pr-4">
                                            <span>{record.visit_date ? format(parseISO(record.visit_date), 'd MMMM yyyy', { locale: ru }) : 'Дата не указана'}</span>
                                            <span className="text-sm text-muted-foreground">{record.doctor_name ?? 'Врач не указан'}</span>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="space-y-2">
                                        <div>
                                            <h4 className="font-semibold">Диагноз:</h4>
                                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{record.diagnosis || 'Нет данных'}</p>
                                        </div>
                                        <div>
                                            <h4 className="font-semibold">Назначенное лечение:</h4>
                                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{record.treatment || 'Нет данных'}</p>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    </CardContent>
                </Card>
            )}
            <Button variant="outline" asChild className="mt-6">
                <Link to="/">Назад к панели</Link>
            </Button>
        </div>
    );
};

export default MyMedicalRecordsPage;