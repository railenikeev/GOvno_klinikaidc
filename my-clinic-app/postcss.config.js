// postcss.config.js
export default {
    plugins: {
        '@tailwindcss/postcss': {}, // <-- Используем новый пакет
        autoprefixer: {},          // autoprefixer оставляем
    },
}