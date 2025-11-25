import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
//import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api':    { target: 'http://localhost:8000', changeOrigin: true },
      '/events': { target: 'http://localhost:8000', changeOrigin: true }
    }
  }
})
