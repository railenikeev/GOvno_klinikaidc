// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Порт, на котором запускается Vite
    port: 5174,
    host: 'localhost',

    // Подключение HMR по WebSocket
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5174,
    },

    // Проксируем все запросы /api/* на ваш Go API Gateway (localhost:8000)
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
