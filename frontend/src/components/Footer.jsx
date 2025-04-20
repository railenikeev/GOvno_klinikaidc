import React from 'react';
import {
    EnvelopeIcon,
    ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';

export default function Footer() {
    return (
        <footer className="bg-gray-950 border-t border-gray-800 text-gray-400 font-mono">
            <div className="container mx-auto px-4 py-6 flex flex-col md:flex-row justify-between items-center">
                <p className="text-sm">&copy; {new Date().getFullYear()} Онлайн-запись. Все права защищены.</p>

                <div className="mt-4 md:mt-0 flex space-x-6">
                    <a
                        href="https://t.me/your_channel"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-purple-400 flex items-center space-x-1 transition"
                    >
                        <ChatBubbleLeftRightIcon className="h-5 w-5" />
                        <span className="text-sm hidden sm:inline">Telegram</span>
                    </a>

                    <a
                        href="mailto:support@example.com"
                        className="hover:text-purple-400 flex items-center space-x-1 transition"
                    >
                        <EnvelopeIcon className="h-5 w-5" />
                        <span className="text-sm hidden sm:inline">Email</span>
                    </a>
                </div>
            </div>
        </footer>
    );
}
