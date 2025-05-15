// my-clinic-app/src/contexts/AuthContext.tsx
import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import apiClient from '@/services/apiClient'; // Наш API клиент

// Определяем тип для данных пользователя в контексте,
// поля должны соответствовать тому, что возвращает ваш эндпоинт /api/me
export interface AuthUser {
    id: number;
    role: string;
    full_name: string;
    email: string;
    phone: string;
    specialization_id?: number | null; // Поле может отсутствовать или быть null
    specialization_name?: string | null; // Поле может отсутствовать или быть null
}

// Определяем тип для значения контекста
interface AuthContextType {
    token: string | null;
    user: AuthUser | null;
    isLoading: boolean; // Флаг для первоначальной загрузки/проверки токена
    login: (newToken: string, userDataFromLogin: { id: number; role: string }) => void; // userDataFromLogin - то, что приходит с /login
    logout: () => void;
    updateUserAuthData: (newUserData: Partial<AuthUser>) => void; // Для обновления данных пользователя
}

// Создаем контекст с начальным значением null или дефолтным состоянием
const AuthContext = createContext<AuthContextType | null>(null);

// --- Компонент Провайдера Контекста ---
interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [token, setToken] = useState<string | null>(localStorage.getItem('authToken'));
    const [user, setUser] = useState<AuthUser | null>(() => {
        const storedUserData = localStorage.getItem('userData');
        try {
            return storedUserData ? JSON.parse(storedUserData) : null;
        } catch (error) {
            console.error("Error parsing stored user data:", error);
            return null;
        }
    });
    const [isLoading, setIsLoading] = useState<boolean>(true);

    // Функция для входа
    const login = useCallback(async (newToken: string, userDataFromLogin: { id: number; role: string }) => {
        localStorage.setItem('authToken', newToken);
        setToken(newToken);
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${newToken}`; // Устанавливаем токен для будущих запросов

        // После успешного логина, запрашиваем полные данные пользователя с /me
        try {
            setIsLoading(true); // Можно установить isLoading пока получаем полные данные
            const response = await apiClient.get<AuthUser>('/me');
            if (response.data) {
                setUser(response.data);
                localStorage.setItem('userData', JSON.stringify(response.data));
            } else {
                // Если /me не вернул данные, используем то, что пришло с /login
                // Это запасной вариант, в идеале /me всегда должен возвращать актуальные данные
                const fallbackUser: AuthUser = {
                    id: userDataFromLogin.id,
                    role: userDataFromLogin.role,
                    full_name: 'N/A', // Заглушки, если /me не отработал
                    email: 'N/A',
                    phone: 'N/A',
                };
                setUser(fallbackUser);
                localStorage.setItem('userData', JSON.stringify(fallbackUser));
            }
        } catch (error) {
            console.error("Ошибка получения данных пользователя после логина (/me):", error);
            // Можно оставить пользователя с данными из login-ответа или обработать ошибку иначе
            const fallbackUser: AuthUser = {
                id: userDataFromLogin.id,
                role: userDataFromLogin.role,
                full_name: 'N/A',
                email: 'N/A',
                phone: 'N/A',
            };
            setUser(fallbackUser);
            localStorage.setItem('userData', JSON.stringify(fallbackUser));
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Функция для выхода
    const logout = useCallback(() => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        delete apiClient.defaults.headers.common['Authorization'];
        setIsLoading(false); // После выхода загрузка завершена
        console.log("Пользователь вышел из системы");
    }, []);

    // Функция для обновления данных пользователя в контексте и localStorage
    const updateUserAuthData = useCallback((newUserData: Partial<AuthUser>) => {
        setUser(prevUser => {
            if (!prevUser) return null;
            const updatedUser = { ...prevUser, ...newUserData };
            localStorage.setItem('userData', JSON.stringify(updatedUser));
            return updatedUser;
        });
    }, []);


    // Эффект для проверки токена при первой загрузке приложения
    useEffect(() => {
        const initializeAuth = async () => {
            const storedToken = localStorage.getItem('authToken');
            const storedUserDataString = localStorage.getItem('userData');

            if (storedToken) {
                apiClient.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
                try {
                    console.log("Найден токен в хранилище. Валидация через /me...");
                    const response = await apiClient.get<AuthUser>('/me'); // Запрос полных данных

                    if (response.data) {
                        setUser(response.data);
                        localStorage.setItem('userData', JSON.stringify(response.data)); // Обновляем сторедж свежими данными
                        setToken(storedToken); // Токен валиден
                        console.log("Состояние Auth инициализировано из валидного токена:", response.data);
                    } else {
                        throw new Error('Некорректный ответ от /me при инициализации');
                    }
                } catch (error) {
                    console.error("Ошибка валидации токена при инициализации или получения данных /me:", error);
                    // Если токен невалиден или /me не вернул данные, выходим из системы
                    setToken(null);
                    setUser(null);
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('userData');
                    delete apiClient.defaults.headers.common['Authorization'];
                }
            }
            setIsLoading(false); // Завершаем начальную загрузку/проверку
        };

        initializeAuth();
    }, []); // Пустой массив зависимостей - выполняется один раз при монтировании

    // Формируем значение контекста
    const contextValue: AuthContextType = {
        token,
        user,
        isLoading,
        login,
        logout,
        updateUserAuthData,
    };

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

// --- Хук для удобного использования контекста ---
export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth должен использоваться внутри AuthProvider');
    }
    return context;
};