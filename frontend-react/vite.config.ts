import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/static/react/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // During development the backend runs on a different port. Proxy API
  // requests so the frontend can simply call `/api/...`.
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
});
