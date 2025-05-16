import React, { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';

interface MainLayoutProps {
    children: ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground">
            <Header />
            {/*
        Добавляем flex flex-col к <main>, чтобы, если children тоже flex, они корректно работали.
        py-8 (или py-12, py-16) добавляет вертикальные отступы сверху и снизу основного контента.
        Увеличим их, чтобы контент не "прилипал", если его мало.
      */}
            <main className="flex-grow container mx-auto px-4 py-12 sm:px-6 lg:px-8 flex flex-col">
                {/*
          Добавим обертку для children, которая может помочь с центрированием,
          если на странице мало контента.
          Если контента много, она просто растянется.
        */}
                <div className="flex-grow flex flex-col w-full"> {/* w-full чтобы занимать ширину контейнера */}
                    {children}
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default MainLayout;