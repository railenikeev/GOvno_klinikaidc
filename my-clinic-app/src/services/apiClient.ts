import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

apiClient.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('authToken');

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error: AxiosError) => {
        return Promise.reject(error);
    }
);

apiClient.interceptors.response.use(
    (response) => {
        return response;
    },
    (error: AxiosError) => {
        console.error('API Error:', error.response?.data || error.message);

        if (error.response) {
            if (error.response.status === 401) {
                console.warn('Unauthorized request (401). Redirecting to login might be needed.');
                localStorage.removeItem('authToken');
            } else if (error.response.status === 403) {
                console.warn('Forbidden request (403). User role might not have permission.');
            }
        } else if (error.request) {
            console.error('API Error: No response received', error.request);
        } else {
            console.error('API Error: Request setup error', error.message);
        }

        return Promise.reject(error);
    }
);

export default apiClient;