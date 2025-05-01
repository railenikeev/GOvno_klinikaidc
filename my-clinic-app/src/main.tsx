import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx' // Ваш главный компонент App
import './index.css'
import { AuthProvider } from './contexts/AuthContext.tsx' // <-- Импортируем провайдер

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <AuthProvider> {/* <-- Оборачиваем App */}
            <App />
        </AuthProvider>
    </React.StrictMode>,
)