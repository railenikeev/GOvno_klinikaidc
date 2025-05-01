import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import apiClient from '@/services/apiClient'; // Наш API клиент

// Определяем тип для данных пользователя в контексте
interface AuthUser {
    id: number;
    role: string;
    // Можно добавить другие поля, если нужно (name, email),
    // но для базовой авторизации достаточно id и role
}

// Определяем тип для значения контекста
interface AuthContextType {
    token: string | null;
    user: AuthUser | null;
    isLoading: boolean; // Флаг для первоначальной загрузки/проверки токена
    login: (token: string, user: AuthUser) => void;
    logout: () => void;
}

// Создаем контекст с начальным значением null или дефолтным состоянием
const AuthContext = createContext<AuthContextType | null>(null);

// --- Компонент Провайдера Контекста ---
interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [token, setToken] = useState<string | null>(null);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true); // Начинаем с загрузки

    // Функция для входа
    const login = useCallback((newToken: string, newUser: AuthUser) => {
        setToken(newToken);
        setUser(newUser);
        localStorage.setItem('authToken', newToken); // Сохраняем токен
        localStorage.setItem('userData', JSON.stringify(newUser)); // Сохраняем данные юзера
        setIsLoading(false); // Закончили "загрузку" после логина
    }, []);

    // Функция для выхода
    const logout = useCallback(() => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('authToken'); // Удаляем токен
        localStorage.removeItem('userData'); // Удаляем данные юзера
        // Принудительно удаляем заголовок Authorization из дефолтных настроек apiClient, если он там остался
        delete apiClient.defaults.headers.common['Authorization'];
        console.log("User logged out");
    }, []);

    // Эффект для проверки токена при первой загрузке приложения
    useEffect(() => {
        const initializeAuth = async () => {
            setIsLoading(true); // Устанавливаем isLoading в true в начале
            const storedToken = localStorage.getItem('authToken');
            const storedUserData = localStorage.getItem('userData'); // Просто проверяем наличие

            if (storedToken && storedUserData) { // Если есть и токен и какие-то данные юзера
                try {
                    // УДАЛЕНО: const parsedUser: AuthUser = JSON.parse(storedUserData);
                    console.log("Найден токен в хранилище. Валидация...");

                    apiClient.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
                    const response = await apiClient.get('/me');

                    if (response.status === 200 && response.data) {
                        console.log("Токен валиден. Данные пользователя с /me:", response.data);
                        const backendUser: AuthUser = {
                            id: response.data.id,
                            role: response.data.role,
                        };
                        setToken(storedToken);
                        setUser(backendUser); // Используем свежие данные
                        localStorage.setItem('userData', JSON.stringify(backendUser)); // Обновляем сторедж свежими данными
                        console.log("Состояние Auth инициализировано из валидного токена.");
                    } else {
                        throw new Error('Некорректный ответ от /me');
                    }
                } catch (error) {
                    console.error("Ошибка валидации токена:", error);
                    // logout(); // logout вызовет рекурсию, если он в зависимостях
                    // Просто очищаем состояние и сторедж напрямую
                    setToken(null);
                    setUser(null);
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('userData');
                    delete apiClient.defaults.headers.common['Authorization'];
                }
            }
            // Не нашли токен или данные в сторедже, или они были невалидны
            setIsLoading(false); // Завершаем загрузку в любом случае
        };

        initializeAuth();
        // Убираем logout из зависимостей, чтобы избежать рекурсии при очистке токена внутри эффекта
    }, []); // Пустой массив зависимостей - выполняется один раз при монтировании

    // Формируем значение контекста
    const contextValue: AuthContextType = {
        token,
        user,
        isLoading,
        login,
        logout,
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