import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext'; // Предполагается, что useAuth есть
import { Button } from '@/components/ui/button';
import { Home, LogIn, UserPlus, UserCircle, LogOut, LayoutDashboard, Bell, CreditCard, CalendarPlus, CalendarCheck, FileText, ShieldCheck } from 'lucide-react'; // Иконки

const Header: React.FC = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        // ВНЕШНИЙ ТЕГ <header> - отвечает за фон и позиционирование на всю ширину
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            {/* ВНУТРЕННИЙ DIV - отвечает за центрирование и ограничение ширины КОНТЕНТА хедера */}
            <div className="container mx-auto flex h-14 max-w-screen-2xl items-center"> {/* max-w-screen-2xl можно настроить или убрать, если container уже настроен в tailwind.config.js */}
                <Link to="/" className="mr-6 flex items-center space-x-2">
                    <ShieldCheck className="h-6 w-6 text-primary" />
                    <span className="font-bold sm:inline-block text-primary">
                        Онлайн-Клиника
                    </span>
                </Link>
                <nav className="flex flex-1 items-center space-x-2 sm:space-x-4 lg:space-x-6 overflow-x-auto whitespace-nowrap"> {/* Добавлены классы для адаптивности навигации */}
                    {/* Ссылка "Главная" теперь ведет на /dashboard если пользователь авторизован, иначе на / */}
                    <Link
                        to={user ? "/dashboard" : "/"}
                        className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                    >
                        <Home className="inline-block h-4 w-4 mr-1 mb-0.5" />
                        Главная
                    </Link>

                    {user && user.role === 'patient' && (
                        <>
                            <Link
                                to="/make-appointment"
                                className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                            >
                                <CalendarPlus className="inline-block h-4 w-4 mr-1 mb-0.5" />
                                Записаться
                            </Link>
                            <Link
                                to="/my-appointments"
                                className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                            >
                                <CalendarCheck className="inline-block h-4 w-4 mr-1 mb-0.5" />
                                Мои записи
                            </Link>
                            <Link
                                to="/my-records"
                                className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                            >
                                <FileText className="inline-block h-4 w-4 mr-1 mb-0.5" />
                                Медкарта
                            </Link>
                            <Link
                                to="/my-payments"
                                className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                            >
                                <CreditCard className="inline-block h-4 w-4 mr-1 mb-0.5" />
                                Платежи
                            </Link>
                        </>
                    )}

                    {user && user.role === 'doctor' && (
                        <>
                            <Link
                                to="/manage-schedule"
                                className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                            >
                                <CalendarPlus className="inline-block h-4 w-4 mr-1 mb-0.5" />
                                Мое расписание
                            </Link>
                            <Link
                                to="/view-appointments"
                                className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                            >
                                <CalendarCheck className="inline-block h-4 w-4 mr-1 mb-0.5" />
                                Записи пациентов
                            </Link>
                        </>
                    )}

                    {user && user.role === 'admin' && (
                        <Link
                            to="/dashboard" // Дашборд администратора
                            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                        >
                            <LayoutDashboard className="inline-block h-4 w-4 mr-1 mb-0.5" />
                            Панель админа
                        </Link>
                    )}
                </nav>

                <div className="flex items-center justify-end space-x-2 ml-auto"> {/* Убрал flex-1, добавил ml-auto */}
                    {user ? (
                        <>
                            {user.role === 'patient' && (
                                <Link to="/notifications">
                                    <Button variant="ghost" size="icon" aria-label="Уведомления">
                                        <Bell className="h-5 w-5" />
                                        <span className="sr-only">Уведомления</span>
                                    </Button>
                                </Link>
                            )}
                            <Link to="/profile">
                                <Button variant="ghost" size="sm" className="px-2 sm:px-3"> {/* Адаптивные отступы */}
                                    <UserCircle className="h-5 w-5 sm:mr-2" />
                                    <span className="hidden sm:inline">{user.full_name || 'Профиль'}</span>
                                </Button>
                            </Link>
                            <Button variant="outline" size="sm" onClick={handleLogout} className="px-2 sm:px-3">
                                <LogOut className="h-4 w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Выйти</span>
                            </Button>
                        </>
                    ) : (
                        <>
                            <Link to="/login">
                                <Button variant="ghost" size="sm">
                                    <LogIn className="h-4 w-4 mr-2" />
                                    Вход
                                </Button>
                            </Link>
                            <Link to="/register">
                                <Button size="sm">
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Регистрация
                                </Button>
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;