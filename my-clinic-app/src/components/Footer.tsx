import React from 'react';
import { MessageCircle, Mail } from 'lucide-react'; // Иконки для Telegram и Email

const Footer: React.FC = () => {
    return (
        // ВНЕШНИЙ ТЕГ <footer> - отвечает за фон и позиционирование на всю ширину
        <footer className="w-full border-t border-border/40 bg-background"> {/* Убедитесь, что w-full здесь есть */}
            {/* ВНУТРЕННИЙ DIV - отвечает за центрирование и ограничение ширины КОНТЕНТА футера */}
            <div className="container mx-auto flex flex-col items-center justify-between gap-4 py-6 md:h-20 md:flex-row md:py-0 md:gap-8"> {/* Увеличил py-6 и добавил md:gap-8 */}
                <div className="flex flex-col items-center gap-2 px-4 md:flex-row md:gap-2 md:px-0 text-center md:text-left">
                    {/* Можно добавить маленькое лого или иконку */}
                    <p className="text-sm leading-loose text-muted-foreground">
                        © {new Date().getFullYear()} Онлайн-Клиника. Все права защищены.
                    </p>
                </div>
                <div className="flex items-center space-x-4 md:space-x-6"> {/* Увеличил space-x */}
                    <a
                        href="#" // Замените # на вашу реальную ссылку на Telegram
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-muted-foreground hover:text-primary flex items-center transition-colors"
                    >
                        <MessageCircle className="h-4 w-4 mr-1.5" /> {/* Увеличил mr */}
                        Telegram
                    </a>
                    <a
                        href="mailto:info@example.com" // Замените на ваш email
                        className="text-sm text-muted-foreground hover:text-primary flex items-center transition-colors"
                    >
                        <Mail className="h-4 w-4 mr-1.5" /> {/* Увеличил mr */}
                        Email
                    </a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;