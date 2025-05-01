import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import axios from 'axios'; // Оставили для isAxiosError

// Удалили закомментированные импорты форм и иконок

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Toaster, toast } from "sonner";

// Тип для пользователя (пациента)
interface PatientInfo {
    id: number;
    full_name: string;
    email?: string;
    phone?: string;
}

// Тип для записей медкарты
interface MedicalRecordEntry {
    id: number;
    patient_id: number;
    doctor_id: number;
    appointment_id: number;
    diagnosis?: string | null;
    treatment?: string | null;
    visit_date: string;
}


const PatientRecordPage: React.FC = () => {
    const { patientId } = useParams<{ patientId: string }>();
    const { user } = useAuth();

    const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);
    const [records, setRecords] = useState<MedicalRecordEntry[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!patientId || !user || user.role !== 'doctor') {
            setError("Ошибка: Необходимые данные отсутствуют или роль неверна.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);

        try {
            const [patientResponse, recordsResponse] = await Promise.all([
                apiClient.get<PatientInfo>(`/users/${patientId}`),
                apiClient.get<MedicalRecordEntry[]>(`/medical_records`, { params: { patient_id: patientId } })
            ]);

            setPatientInfo(patientResponse.data);

            recordsResponse.data.sort((a, b) => b.visit_date.localeCompare(a.visit_date));
            setRecords(recordsResponse.data);

        } catch (err: any) {
            // Упрощенная обработка ошибок
            const errorMessage = "Не удалось загрузить данные пациента или медкарту.";
            if (axios.isAxiosError(err) && err.response) {
                console.error("Ошибка загрузки данных (Axios):", err.response);
            } else if (err instanceof Error) {
                console.error("Ошибка загрузки данных (JS):", err);
            } else {
                console.error("Неизвестная ошибка загрузки данных:", err);
            }
            setError(errorMessage);
            toast.error(errorMessage);

        } finally {
            setIsLoading(false);
        }
    }, [patientId, user]);

    useEffect(() => {
        fetchData().catch(console.error);
    }, [fetchData]);

    // Форма добавления записи пока не реализована

    // --- Рендеринг ---
    if (isLoading && !patientInfo) {
        return <div className="container mx-auto p-4">Загрузка данных пациента...</div>;
    }

    if (error && !patientInfo) {
        return <div className="container mx-auto p-4 text-red-500">{error}</div>;
    }

    if (!patientInfo) {
        return <div className="container mx-auto p-4 text-red-500">Данные пациента не найдены.</div>;
    }

    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">
                    Медкарта пациента: {patientInfo.full_name} (ID: {patientInfo.id})
                </h1>
                <Button variant="outline" asChild>
                    <Link to="/view-appointments">К списку записей</Link>
                </Button>
            </div>

            {/* --- Отображение существующих записей --- */}
            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>История записей</CardTitle>
                    <CardDescription>Записи, сделанные вами для этого пациента.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading && records.length === 0 && <p>Загрузка записей...</p>} {/* Показываем лоадер если грузим только записи */}
                    {!isLoading && records.length === 0 ? (
                        <p>Для этого пациента еще нет записей в медкарте, сделанных вами.</p>
                    ) : (
                        <Accordion type="single" collapsible className="w-full">
                            {records.map((record) => (
                                <AccordionItem value={`item-${record.id}`} key={record.id}>
                                    <AccordionTrigger>
                                        <div className="flex justify-between w-full pr-4">
                                            <span>{record.visit_date ? format(parseISO(record.visit_date), 'd MMMM<y_bin_46>, EEEE', { locale: ru }) : 'Дата не указана'}</span>
                                            <span className="text-sm text-muted-foreground">Запись #{record.id} (Прием #{record.appointment_id})</span>
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
                    )}
                </CardContent>
            </Card>

        </div>
    );
};

export default PatientRecordPage;