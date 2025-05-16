import React, { ReactNode } from 'react';
import Header from './Header'; // Путь изменен
import Footer from './Footer'; // Путь изменен

interface MainLayoutProps {
    children: ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground">
            <Header />
            <main className="flex-grow container mx-auto px-4 py-8 sm:px-6 lg:px-8">
                {children}
            </main>
            <Footer />
        </div>
    );
};

export default MainLayout;