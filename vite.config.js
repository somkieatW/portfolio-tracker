import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/portfolio-tracker/',
  server: {
    proxy: {
      '/finnomena-api': {
        target: 'https://www.finnomena.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/finnomena-api/, ''),
        secure: true,
      },
      '/yahoo-api': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yahoo-api/, ''),
        secure: true,
      },
    },
  },
})
