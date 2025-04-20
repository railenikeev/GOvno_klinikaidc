import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [ react() ],
  server: {
    proxy: {
      // Проксируем все /api/users/* → http://localhost:8000/users/*
      '/api/users': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, ''),
      },
      // Проксируем /api/clinics/* → http://localhost:8000/clinics/*
      '/api/clinics': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, ''),
      },
      // если есть другие сервисы — добавьте их аналогично
    }
  }
})
