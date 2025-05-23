import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import apiClient from '@/services/apiClient';

export interface AuthUser {
    id: number;
    role: string;
    full_name: string;
    email: string;
    phone: string;
    specialization_id?: number | null;
    specialization_name?: string | null;
}

interface AuthContextType {
    token: string | null;
    user: AuthUser | null;
    isLoading: boolean;
    login: (newToken: string, userDataFromLogin: { id: number; role: string }) => void;
    logout: () => void;
    updateUserAuthData: (newUserData: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

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

    const login = useCallback(async (newToken: string, userDataFromLogin: { id: number; role: string }) => {
        localStorage.setItem('authToken', newToken);
        setToken(newToken);
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

        try {
            setIsLoading(true);
            const response = await apiClient.get<AuthUser>('/me');
            if (response.data) {
                setUser(response.data);
                localStorage.setItem('userData', JSON.stringify(response.data));
            } else {
                const fallbackUser: AuthUser = {
                    id: userDataFromLogin.id,
                    role: userDataFromLogin.role,
                    full_name: 'N/A',
                    email: 'N/A',
                    phone: 'N/A',
                };
                setUser(fallbackUser);
                localStorage.setItem('userData', JSON.stringify(fallbackUser));
            }
        } catch (error) {
            console.error("Ошибка получения данных пользователя после логина (/me):", error);
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

    const logout = useCallback(() => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        delete apiClient.defaults.headers.common['Authorization'];
        setIsLoading(false);
        console.log("Пользователь вышел из системы");
    }, []);

    const updateUserAuthData = useCallback((newUserData: Partial<AuthUser>) => {
        setUser(prevUser => {
            if (!prevUser) return null;
            const updatedUser = { ...prevUser, ...newUserData };
            localStorage.setItem('userData', JSON.stringify(updatedUser));
            return updatedUser;
        });
    }, []);


    useEffect(() => {
        const initializeAuth = async () => {
            const storedToken = localStorage.getItem('authToken');
            const storedUserDataString = localStorage.getItem('userData');

            if (storedToken) {
                apiClient.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
                try {
                    console.log("Найден токен в хранилище. Валидация через /me...");
                    const response = await apiClient.get<AuthUser>('/me');

                    if (response.data) {
                        setUser(response.data);
                        localStorage.setItem('userData', JSON.stringify(response.data));
                        setToken(storedToken);
                        console.log("Состояние Auth инициализировано из валидного токена:", response.data);
                    } else {
                        throw new Error('Некорректный ответ от /me при инициализации');
                    }
                } catch (error) {
                    console.error("Ошибка валидации токена при инициализации или получения данных /me:", error);
                    setToken(null);
                    setUser(null);
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('userData');
                    delete apiClient.defaults.headers.common['Authorization'];
                }
            }
            setIsLoading(false);
        };

        initializeAuth();
    }, []);

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

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth должен использоваться внутри AuthProvider');
    }
    return context;
};