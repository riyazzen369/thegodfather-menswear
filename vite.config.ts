import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so dist/index.html works from any folder or sub-path
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500
  }
})
