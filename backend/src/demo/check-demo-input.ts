import path from 'node:path';

import { config as loadEnv } from 'dotenv';

import { demoPreflight } from './demo-input.js';

/**
 * pnpm demo:check — primer paso de `pnpm demo:seed`, antes del seed Foundation.
 * Solo valida DEMO_USER_PASSWORD: no abre ninguna conexión a PostgreSQL y nunca
 * imprime la contraseña ni un hash.
 */
loadEnv({ path: path.resolve(process.cwd(), '..', '.env'), quiet: true });

const result = demoPreflight(process.env);
if (result.ok) {
  process.stdout.write('Preflight demo: DEMO_USER_PASSWORD válida.\n');
} else {
  process.stderr.write(`${result.message}\nNo se ejecutó ningún seed.\n`);
  process.exitCode = 1;
}
