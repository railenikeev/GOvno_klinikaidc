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

            <main className="flex-grow w-full container mx-auto px-4 py-8 md:py-12 flex flex-col">
                <div className="flex-1 flex flex-col w-full">
                    {children}
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default MainLayout;