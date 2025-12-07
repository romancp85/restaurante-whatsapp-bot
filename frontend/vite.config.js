// frontend/vite.config.js

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  
  // 🛑 CONFIGURACIÓN DEL PROXY CRÍTICA 🛑
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // El puerto de tu servidor Express/Node
        changeOrigin: true,
        secure: false,
        // No es necesario reescribir la ruta aquí, ya que el backend espera /api
      },
    },
  },
  // ------------------------------------
});