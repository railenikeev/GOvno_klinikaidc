import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import axios from 'axios'; // Оставили для isAxiosError

import apiClient from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; // Для отображения даты визита
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Toaster, toast } from "sonner";

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

// Тип для пользователя (пациента)
interface PatientInfo {
    id: number;
    full_name: string;
    email?: string;
    phone?: string;
}

// Тип для записей медкарты (возвращаемый с бэкенда)
interface MedicalRecordEntry {
    id: number;
    patient_id: number;
    doctor_id: number;
    appointment_id: number;
    diagnosis?: string | null;
    treatment?: string | null;
    visit_date: string; // Формат YYYY-MM-DD
    patient_name?: string | null; // Может приходить от бэкенда
    doctor_name?: string | null;  // Может приходить от бэкенда
}

// Интерфейс для приемов, которые можно документировать
interface DocumentableAppointment {
    id: number;         // Это appointments.id
    date: string;       // Дата приема (YYYY-MM-DD)
    start_time: string; // Время начала приема (HH:MM)
    // Можно добавить patient_name, doctor_name, если нужно, но они уже есть в patientInfo и user
}

// Схема валидации для формы добавления мед. записи
const addRecordSchema = z.object({
    appointmentId: z.string().min(1, "Выберите прием для документирования"),
    diagnosis: z.string().max(2000, "Диагноз не должен превышать 2000 символов").optional(),
    treatment: z.string().max(4000, "Лечение не должно превышать 4000 символов").optional(),
});
type AddRecordFormValues = z.infer<typeof addRecordSchema>;


const PatientRecordPage: React.FC = () => {
    const { patientId } = useParams<{ patientId: string }>();
    const { user } = useAuth();

    const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);
    const [records, setRecords] = useState<MedicalRecordEntry[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true); // Общая загрузка данных страницы
    const [error, setError] = useState<string | null>(null);

    const [isSubmittingRecord, setIsSubmittingRecord] = useState<boolean>(false);
    const [documentableAppointments, setDocumentableAppointments] = useState<DocumentableAppointment[]>([]);
    const [isLoadingAppointments, setIsLoadingAppointments] = useState<boolean>(false);

    const addRecordForm = useForm<AddRecordFormValues>({
        resolver: zodResolver(addRecordSchema),
        defaultValues: {
            appointmentId: "",
            diagnosis: "",
            treatment: "",
        },
    });

    const fetchPatientAndRecordsData = useCallback(async () => {
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
            // Сортируем мед. записи, свежие вверху
            recordsResponse.data.sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());
            setRecords(recordsResponse.data);

        } catch (err: any) {
            const errorMessage = "Не удалось загрузить данные пациента или его медкарту.";
            if (axios.isAxiosError(err) && err.response) {
                console.error("Ошибка загрузки данных пациента/медкарты (Axios):", err.response);
            } else if (err instanceof Error) {
                console.error("Ошибка загрузки данных пациента/медкарты (JS):", err);
            } else {
                console.error("Неизвестная ошибка загрузки данных пациента/медкарты:", err);
            }
            setError(errorMessage);
            toast.error(errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, [patientId, user]);

    const fetchDocumentableAppointments = useCallback(async () => {
        if (!patientId || !user || user.role !== 'doctor') return;

        setIsLoadingAppointments(true);
        try {
            // !!! ВАЖНО: Этот эндпоинт /appointments/doctor/for-documentation нужно реализовать на бэкенде
            // Он должен принимать patient_id и doctor_id (из X-User-ID) и возвращать
            // список appointments со статусом 'completed', для которых еще нет записи в medical_records.
            // Поля: id (appointments.id), date (doctor_schedules.date), start_time (doctor_schedules.start_time)
            const response = await apiClient.get<DocumentableAppointment[]>(`/appointments/doctor/for-documentation`, {
                params: { patient_id: patientId } // Бэкенд должен извлечь doctor_id из X-User-ID
            });

            if (Array.isArray(response.data)) {
                response.data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                setDocumentableAppointments(response.data);
            } else {
                console.warn("Получен некорректный формат данных для документируемых приемов:", response.data);
                setDocumentableAppointments([]);
                toast.warn("Не удалось получить список приемов для документирования: неверный формат ответа.");
            }
        } catch (err) {
            console.error("Ошибка загрузки документируемых приемов:", err);
            toast.error("Не удалось загрузить список приемов для документирования.");
            setDocumentableAppointments([]);
        } finally {
            setIsLoadingAppointments(false);
        }
    }, [patientId, user]);

    useEffect(() => {
        fetchPatientAndRecordsData();
        if (patientId && user && user.role === 'doctor') {
            fetchDocumentableAppointments();
        }
    }, [fetchPatientAndRecordsData, fetchDocumentableAppointments, patientId, user]);


    const onAddRecordSubmit = async (data: AddRecordFormValues) => {
        if (!user || !patientInfo) {
            toast.error("Ошибка: Данные врача или пациента отсутствуют.");
            return;
        }
        if (!data.appointmentId) {
            addRecordForm.setError("appointmentId", {type: "manual", message: "Необходимо выбрать прием."})
            toast.error("Выберите прием для документирования.");
            return;
        }

        const selectedAppointment = documentableAppointments.find(appt => appt.id.toString() === data.appointmentId);
        if (!selectedAppointment) {
            toast.error("Выбран некорректный прием. Обновите страницу и попробуйте снова.");
            return;
        }

        setIsSubmittingRecord(true);
        const payload = {
            patient_id: patientInfo.id,
            doctor_id: user.id,
            appointment_id: parseInt(data.appointmentId, 10),
            diagnosis: data.diagnosis || null,
            treatment: data.treatment || null,
            visit_date: selectedAppointment.date, // Дата визита из выбранного appointment
        };

        try {
            const response = await apiClient.post<MedicalRecordEntry>('/medical_records', payload);
            toast.success(`Медицинская запись для приема #${response.data.appointment_id} успешно добавлена!`);
            addRecordForm.reset();
            fetchPatientAndRecordsData(); // Обновляем список существующих записей
            fetchDocumentableAppointments(); // Обновляем список приемов для документирования
        } catch (err: any) {
            console.error("Ошибка добавления мед. записи:", err);
            let errorMessage = "Не удалось добавить медицинскую запись.";
            if (axios.isAxiosError(err) && err.response) {
                errorMessage = err.response.data?.error || `Ошибка сервера (${err.response.status})`;
                if (err.response.status === 409) {
                    addRecordForm.setError("appointmentId", { type: "manual", message: "Для этого приема уже существует запись." });
                }
            } else if (err instanceof Error) {
                errorMessage = err.message;
            }
            toast.error(errorMessage);
        } finally {
            setIsSubmittingRecord(false);
        }
    };

    // --- Рендеринг ---
    if (isLoading && !patientInfo) { // Показываем только если грузятся основные данные и их еще нет
        return <div className="container mx-auto p-4">Загрузка данных пациента...</div>;
    }

    if (error && !patientInfo) { // Показываем если основная ошибка и нет данных пациента
        return <div className="container mx-auto p-4 text-red-500">{error}</div>;
    }

    if (!patientInfo) { // Если после всех загрузок данных пациента нет
        return <div className="container mx-auto p-4 text-red-500">Данные пациента не найдены. Возможно, неверный ID.</div>;
    }

    return (
        <div className="container mx-auto p-4">
            <Toaster position="top-center" richColors closeButton />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">
                    Медкарта пациента: {patientInfo.full_name} (ID: {patientInfo.id})
                </h1>
                <Button variant="outline" asChild>
                    <Link to="/view-appointments">К списку моих приемов</Link>
                </Button>
            </div>

            {/* --- Форма добавления новой записи --- */}
            {user && user.role === 'doctor' && (
                <Card className="mb-8">
                    <CardHeader>
                        <CardTitle>Добавить новую запись в медкарту</CardTitle>
                        <CardDescription>
                            Выберите завершенный прием и заполните информацию о диагнозе и лечении.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form {...addRecordForm}>
                            <form onSubmit={addRecordForm.handleSubmit(onAddRecordSubmit)} className="space-y-6">
                                <FormField
                                    control={addRecordForm.control}
                                    name="appointmentId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Прием для документирования *</FormLabel>
                                            <Select
                                                onValueChange={field.onChange}
                                                value={field.value} // Используем value из field
                                                disabled={isLoadingAppointments || documentableAppointments.length === 0 || isSubmittingRecord}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder={
                                                            isLoadingAppointments
                                                                ? "Загрузка приемов..."
                                                                : documentableAppointments.length === 0
                                                                    ? "Нет приемов для документирования"
                                                                    : "Выберите прием..."
                                                        } />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {documentableAppointments.map((appt) => (
                                                        <SelectItem key={appt.id} value={appt.id.toString()}>
                                                            {format(parseISO(appt.date), 'dd.MM.yyyy', { locale: ru })} {appt.start_time.substring(0,5)} (ID записи: {appt.id})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {addRecordForm.watch("appointmentId") && documentableAppointments.find(a => a.id.toString() === addRecordForm.watch("appointmentId")) && (
                                    <div>
                                        <FormLabel>Дата визита</FormLabel>
                                        <Input
                                            value={
                                                format(parseISO(documentableAppointments.find(a => a.id.toString() === addRecordForm.watch("appointmentId"))!.date), 'dd MMMM yyyy, EEEE', { locale: ru })
                                            }
                                            disabled
                                            readOnly
                                            className="mt-1"
                                        />
                                    </div>
                                )}

                                <FormField
                                    control={addRecordForm.control}
                                    name="diagnosis"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Диагноз</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Введите предварительный или окончательный диагноз..."
                                                    {...field}
                                                    value={field.value ?? ''} // Убедимся, что null не передается напрямую
                                                    rows={4}
                                                    disabled={isSubmittingRecord}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={addRecordForm.control}
                                    name="treatment"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Назначенное лечение/Рекомендации</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Опишите назначенное лечение, процедуры, медикаменты, рекомендации..."
                                                    {...field}
                                                    value={field.value ?? ''} // Убедимся, что null не передается напрямую
                                                    rows={6}
                                                    disabled={isSubmittingRecord}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <Button type="submit" disabled={isSubmittingRecord || isLoadingAppointments || !addRecordForm.formState.isValid}>
                                    {isSubmittingRecord ? 'Добавление...' : 'Добавить запись'}
                                </Button>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            )}

            {/* --- Отображение существующих записей --- */}
            <Card>
                <CardHeader>
                    <CardTitle>История записей</CardTitle>
                    <CardDescription>
                        {user?.role === 'doctor' ? `Записи, сделанные для пациента ${patientInfo.full_name}.` : 'Ваши медицинские записи.'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading && records.length === 0 && <p>Загрузка записей...</p>}
                    {!isLoading && records.length === 0 && !error && ( // Добавил !error чтобы не показывать, если была ошибка загрузки
                        <p>Для этого пациента еще нет записей в медкарте.</p>
                    )}
                    {!isLoading && records.length > 0 && (
                        <Accordion type="single" collapsible className="w-full">
                            {records.map((record) => (
                                <AccordionItem value={`item-${record.id}`} key={record.id}>
                                    <AccordionTrigger>
                                        <div className="flex justify-between items-center w-full pr-4">
                                            <span className="font-medium">
                                                {record.visit_date ? format(parseISO(record.visit_date), 'd MMMM yyyy, EEEE', { locale: ru }) : 'Дата не указана'}
                                            </span>
                                            <div className="text-right">
                                                <span className="text-sm text-muted-foreground block">Запись ЭМК #{record.id}</span>
                                                <span className="text-xs text-muted-foreground block">(Прием #{record.appointment_id})</span>
                                                {record.doctor_name && <span className="text-xs text-muted-foreground block">Врач: {record.doctor_name}</span>}
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="space-y-3 pl-2 pr-2 pt-2 pb-4 border-t mt-2">
                                        <div>
                                            <h4 className="font-semibold text-sm">Диагноз:</h4>
                                            <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1 p-2 bg-muted/50 rounded-md">
                                                {record.diagnosis || <span className="italic">Нет данных</span>}
                                            </p>
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-sm">Назначенное лечение/Рекомендации:</h4>
                                            <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1 p-2 bg-muted/50 rounded-md">
                                                {record.treatment || <span className="italic">Нет данных</span>}
                                            </p>
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