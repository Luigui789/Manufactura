import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth/password-policy.js';
import { DEMO_PASSWORD_ENV } from './demo-data.js';

/**
 * Entrada del dataset demo. Módulo puro: no importa Prisma ni abre conexiones, para que
 * el preflight pueda ejecutarse antes de que exista cualquier escritura en la base.
 */
export class DemoInputError extends Error {}

/** Valida DEMO_USER_PASSWORD con la política de contraseñas, sin incluir nunca su valor. */
export function readDemoPassword(env: Record<string, string | undefined>): string {
  const raw = env[DEMO_PASSWORD_ENV];
  if (!raw?.trim())
    throw new DemoInputError(
      `${DEMO_PASSWORD_ENV} es obligatoria para crear las cuentas demo. ` +
        'Defínela solo en tu sesión local (ver docs/demo-dataset.md).',
    );
  const password = raw.normalize('NFC');
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH)
    throw new DemoInputError(
      `${DEMO_PASSWORD_ENV} debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`,
    );
  return password;
}

export type DemoPreflightResult = { ok: true } | { ok: false; message: string };

/** Preflight de `pnpm demo:seed`: misma política que el seed, sin tocar la base. */
export function demoPreflight(env: Record<string, string | undefined>): DemoPreflightResult {
  try {
    readDemoPassword(env);
    return { ok: true };
  } catch (error) {
    if (error instanceof DemoInputError) return { ok: false, message: error.message };
    throw error;
  }
}
