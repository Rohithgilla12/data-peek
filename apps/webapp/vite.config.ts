import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, '../../packages/shared/src'),
      '@data-peek/shared': resolve(__dirname, '../../packages/shared/src/index.ts')
    },
    dedupe: ['react', 'react-dom']
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5200
  }
})
