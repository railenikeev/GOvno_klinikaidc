import React from 'react';
import { MessageCircle, Mail } from 'lucide-react';

const Footer: React.FC = () => {
    return (
        <footer className="w-full border-t border-border/40 bg-background">
            <div className="container mx-auto flex flex-col items-center justify-between gap-4 py-6 md:h-20 md:flex-row md:py-0 md:gap-8">
                <div className="flex flex-col items-center gap-2 px-4 md:flex-row md:gap-2 md:px-0 text-center md:text-left">
                    <p className="text-sm leading-loose text-muted-foreground">
                        © {new Date().getFullYear()} Онлайн-Клиника. Все права защищены.
                    </p>
                </div>
                <div className="flex items-center space-x-4 md:space-x-6">
                    <a
                        href="#"
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-muted-foreground hover:text-primary flex items-center transition-colors"
                    >
                        <MessageCircle className="h-4 w-4 mr-1.5" />
                        Telegram
                    </a>
                    <a
                        href="mailto:info@example.com"
                        className="text-sm text-muted-foreground hover:text-primary flex items-center transition-colors"
                    >
                        <Mail className="h-4 w-4 mr-1.5" />
                        Email
                    </a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;