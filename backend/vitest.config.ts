import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.e2e-spec.ts'],
    // Todavia no hay pruebas unitarias: las reglas de negocio llegan en las
    // etapas siguientes y es entonces cuando toca probarlas (§40). Sin esto,
    // `pnpm --filter backend test` fallaria simplemente por no encontrar nada.
    passWithNoTests: true,
  },
});
