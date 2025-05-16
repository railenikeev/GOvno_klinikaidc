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
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 max-w-screen-2xl items-center">
                <Link to="/" className="mr-6 flex items-center space-x-2">
                    {/* Можно добавить SVG логотип или иконку клиники */}
                    <ShieldCheck className="h-6 w-6 text-primary" />
                    <span className="font-bold sm:inline-block text-primary">
            Онлайн-Клиника
          </span>
                </Link>
                <nav className="flex flex-1 items-center space-x-4 lg:space-x-6">
                    <Link
                        to="/"
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
                            to="/" // Дашборд администратора
                            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                        >
                            <LayoutDashboard className="inline-block h-4 w-4 mr-1 mb-0.5" />
                            Панель админа
                        </Link>
                    )}
                </nav>

                <div className="flex flex-1 items-center justify-end space-x-2">
                    {user ? (
                        <>
                            {user.role === 'patient' && (
                                <Link to="/notifications">
                                    <Button variant="ghost" size="icon">
                                        <Bell className="h-5 w-5" />
                                        <span className="sr-only">Уведомления</span>
                                    </Button>
                                </Link>
                            )}
                            <Link to="/profile">
                                <Button variant="ghost" size="sm">
                                    <UserCircle className="h-5 w-5 mr-2" />
                                    {user.full_name || 'Профиль'}
                                </Button>
                            </Link>
                            <Button variant="outline" size="sm" onClick={handleLogout}>
                                <LogOut className="h-4 w-4 mr-2" />
                                Выйти
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