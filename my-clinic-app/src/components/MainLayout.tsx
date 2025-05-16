import React, { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';

interface MainLayoutProps {
    children: ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground">
            {/* Header должен быть вне container mx-auto, если его фон должен быть на всю ширину */}
            <Header />

            {/* Основной контент страницы */}
            <main className="flex-grow w-full container mx-auto px-4 py-8 md:py-12 flex flex-col">
                {/*
          Эта обертка гарантирует, что дочерние элементы (ваша страница)
          могут использовать flex-свойства и занимать доступную ширину контейнера.
        */}
                <div className="flex-1 flex flex-col w-full">
                    {children}
                </div>
            </main>

            {/* Footer должен быть вне container mx-auto, если его фон должен быть на всю ширину */}
            <Footer />
        </div>
    );
};

export default MainLayout;