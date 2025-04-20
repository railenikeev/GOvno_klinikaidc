import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Пользователи (из authService, profileService, clinicService)
      '/api/users': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      // Клиники (из clinicService, bookingService)
      '/api/clinics': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      // Приёмы (из appointmentService и bookingService)
      '/api/appointments': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      // Города (из bookingService)
      '/api/cities': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      // Врачи (из bookingService)
      '/api/doctors': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      // Расписания (из bookingService)
      '/api/schedules': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      // Обработчик всего остального на /api (на случай новых эндпоинтов)
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
