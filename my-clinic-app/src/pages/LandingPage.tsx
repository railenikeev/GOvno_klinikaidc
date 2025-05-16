import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ShieldCheck, LogIn, UserPlus } from 'lucide-react'; // Иконки

const LandingPage: React.FC = () => {
    return (
        <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-50 to-sky-100 text-slate-800">
            {/* Простой хедер для Landing Page */}
            <header className="py-4 px-6 md:px-10 shadow-sm bg-white/80 backdrop-blur-md sticky top-0 z-40">
                <nav className="container mx-auto flex justify-between items-center">
                    <Link to="/" className="flex items-center space-x-2">
                        <ShieldCheck className="h-7 w-7 text-primary" />
                        <span className="text-xl font-bold text-primary">
              Онлайн-Клиника
            </span>
                    </Link>
                    <div className="space-x-2">
                        <Button variant="ghost" asChild>
                            <Link to="/login">
                                <LogIn className="mr-2 h-4 w-4" />
                                Вход
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link to="/register">
                                <UserPlus className="mr-2 h-4 w-4" />
                                Регистрация
                            </Link>
                        </Button>
                    </div>
                </nav>
            </header>

            {/* Основной контент */}
            <main className="flex-grow flex flex-col items-center justify-center text-center px-4 py-12">
                <div className="bg-white p-8 md:p-16 rounded-xl shadow-2xl max-w-2xl w-full transform transition-all hover:scale-[1.01] duration-300">
                    <ShieldCheck className="h-20 w-20 text-primary mx-auto mb-6" />
                    <h1 className="text-4xl md:text-5xl font-bold text-primary mb-6">
                        Добро пожаловать в Онлайн-Клинику!
                    </h1>
                    <p className="text-lg text-muted-foreground mb-10 max-w-md mx-auto">
                        Заботьтесь о своем здоровье легко и удобно. Быстрая запись к лучшим врачам без звонков и очередей.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Button size="lg" className="w-full sm:w-auto text-base px-8 py-6" asChild>
                            <Link to="/register">
                                <UserPlus className="mr-2 h-5 w-5" />
                                Создать аккаунт
                            </Link>
                        </Button>
                        <Button variant="outline" size="lg" className="w-full sm:w-auto text-base px-8 py-6" asChild>
                            <Link to="/login">
                                <LogIn className="mr-2 h-5 w-5" />
                                Уже есть аккаунт? Войти
                            </Link>
                        </Button>
                    </div>
                </div>

                {/* Дополнительные блоки информации (опционально) */}
                <section className="mt-20 max-w-4xl w-full grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
                    <div className="bg-white/70 p-6 rounded-lg shadow-lg backdrop-blur-sm">
                        <h3 className="font-semibold text-primary text-lg mb-2">Простота и Удобство</h3>
                        <p className="text-sm text-slate-600">Интуитивно понятный интерфейс для записи на прием в несколько кликов.</p>
                    </div>
                    <div className="bg-white/70 p-6 rounded-lg shadow-lg backdrop-blur-sm">
                        <h3 className="font-semibold text-primary text-lg mb-2">Лучшие Специалисты</h3>
                        <p className="text-sm text-slate-600">Доступ к расписанию квалифицированных врачей различных специализаций.</p>
                    </div>
                    <div className="bg-white/70 p-6 rounded-lg shadow-lg backdrop-blur-sm">
                        <h3 className="font-semibold text-primary text-lg mb-2">Ваше Здоровье — Наш Приоритет</h3>
                        <p className="text-sm text-slate-600">Мы стремимся сделать медицинское обслуживание максимально доступным.</p>
                    </div>
                </section>
            </main>

            {/* Футер для Landing Page */}
            <footer className="py-6 px-6 md:px-10 text-center text-sm text-slate-600 border-t border-slate-200 bg-white/50">
                © {new Date().getFullYear()} Онлайн-Клиника. Надежный сервис для вашего здоровья.
            </footer>
        </div>
    );
};

export default LandingPage;