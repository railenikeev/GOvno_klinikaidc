import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// Базовый URL нашего API Gateway
// В реальном приложении лучше выносить в переменные окружения (.env)
const API_BASE_URL = 'http://localhost:8000/api';

// Создаем экземпляр axios с базовой конфигурацией
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// --- Interceptor для добавления JWT токена в заголовки ---
// Эта функция будет выполняться перед КАЖДЫМ запросом
apiClient.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        // Пытаемся получить токен из localStorage (или другого хранилища)
        // Используем ключ 'authToken' (можете выбрать другой)
        const token = localStorage.getItem('authToken');

        // Если токен есть, добавляем заголовок Authorization
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config; // Возвращаем измененную конфигурацию запроса
    },
    (error: AxiosError) => {
        // Обработка ошибки конфигурации запроса (маловероятно)
        return Promise.reject(error);
    }
);

// --- Interceptor для обработки ответов (опционально, но полезно) ---
// Эта функция будет выполняться после КАЖДОГО ответа
apiClient.interceptors.response.use(
    (response) => {
        // Если ответ успешный (статус 2xx), просто возвращаем его
        return response;
    },
    (error: AxiosError) => {
        // Обработка ошибок ответа
        console.error('API Error:', error.response?.data || error.message); // Логгируем ошибку

        if (error.response) {
            // Сервер ответил с ошибкой (статус не 2xx)
            if (error.response.status === 401) {
                // Ошибка авторизации (неверный токен или его нет)
                // Здесь можно реализовать автоматический выход пользователя (logout)
                // Например:
                // logoutUser(); // Функция, которая очищает токен и редиректит на /login
                // window.location.href = '/login'; // Простой редирект
                console.warn('Unauthorized request (401). Redirecting to login might be needed.');
                // Можно очистить токен, если он явно невалиден
                localStorage.removeItem('authToken');
            } else if (error.response.status === 403) {
                // Доступ запрещен (роль не подходит)
                console.warn('Forbidden request (403). User role might not have permission.');
            }
            // Можно добавить обработку других статусов (404, 500 и т.д.)
        } else if (error.request) {
            // Запрос был сделан, но ответ не получен (проблема с сетью, бэкенд недоступен)
            console.error('API Error: No response received', error.request);
        } else {
            // Ошибка при настройке запроса
            console.error('API Error: Request setup error', error.message);
        }

        // Возвращаем ошибку, чтобы ее можно было обработать в компоненте (через .catch())
        return Promise.reject(error);
    }
);

// Экспортируем настроенный экземпляр axios
export default apiClient;