import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La web se compila dentro de backend/public para que la API la sirva con el mismo dominio HTTPS.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:3000' }
  }
});
