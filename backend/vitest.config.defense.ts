import { defineConfig } from 'vitest/config';

// Explicit opt-in: consumes the official dataset; never runs after other E2E suites.
export default defineConfig({
  test: {
    include: ['test/integrated-defense.e2e-spec.ts'],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 120_000,
    env: { NODE_ENV: 'development' }, // Real MQTT ingestion is disabled in NODE_ENV=test.
  },
});
