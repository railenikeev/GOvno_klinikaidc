import React from 'react';
import { MessageCircle, Mail } from 'lucide-react'; // Иконки для Telegram и Email

const Footer: React.FC = () => {
    return (
        <footer className="border-t border-border/40 bg-background">
            <div className="container flex flex-col items-center justify-between gap-4 py-10 md:h-20 md:flex-row md:py-0">
                <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
                    {/* Можно добавить маленькое лого или иконку */}
                    <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
                        © {new Date().getFullYear()} Онлайн-Клиника. Все права защищены.
                    </p>
                </div>
                <div className="flex items-center space-x-4">
                    <a
                        href="#" // Замените # на вашу реальную ссылку на Telegram
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-muted-foreground hover:text-primary flex items-center"
                    >
                        <MessageCircle className="h-4 w-4 mr-1" />
                        Telegram
                    </a>
                    <a
                        href="mailto:info@example.com" // Замените на ваш email
                        className="text-sm text-muted-foreground hover:text-primary flex items-center"
                    >
                        <Mail className="h-4 w-4 mr-1" />
                        Email
                    </a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;