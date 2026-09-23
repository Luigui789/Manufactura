import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // El .env vive en la raiz del monorepo para que exista una sola fuente de
  // verdad compartida por docker-compose, el backend y el frontend. Vite solo
  // inyecta en el bundle las variables con prefijo VITE_, de modo que
  // DATABASE_URL y la contrasena de PostgreSQL nunca llegan al navegador.
  envDir: path.resolve(import.meta.dirname, '..'),

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },

  server: {
    port: 5173,
  },
});
