import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Las pruebas e2e abren la aplicacion real contra PostgreSQL: conviene que
    // no compitan entre si por la misma base.
    fileParallelism: false,
  },
});
