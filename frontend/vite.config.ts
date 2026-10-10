import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(import.meta.dirname, '..');
  const env = loadEnv(mode, envDir, 'FRONTEND_URL');

  const frontendUrl = new URL(env.FRONTEND_URL || 'http://localhost:5173');
  const port = Number(frontendUrl.port || (frontendUrl.protocol === 'https:' ? '443' : '80'));

  return {
    plugins: [react(), tailwindcss()],
    envDir,
    clearScreen: false,

    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
      },
    },

    server: {
      host: 'localhost',
      port,
      strictPort: true,
    },
  };
});
