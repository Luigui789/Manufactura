import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Full-page workflows mount Radix dialogs and paginated catalogs. Avoid
    // competing jsdom workers and premature timeouts on development machines.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
