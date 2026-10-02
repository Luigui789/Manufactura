import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.e2e-spec.ts'],
    // Las pruebas unitarias viven junto al codigo (*.spec.ts); las que necesitan
    // PostgreSQL son e2e (*.e2e-spec.ts) y tienen su propia configuracion.
    passWithNoTests: true,
  },
});
