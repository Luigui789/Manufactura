import 'reflect-metadata';

import { validateEnv } from '../config/env.validation.js';
import { AdminInputError, readAdminInput } from './admin-input.js';

describe('Entrada de admin:create', () => {
  const valid = {
    ADMIN_EMAIL: '  Admin@EcoSoap.Example ',
    ADMIN_FULL_NAME: ' Administración ',
    ADMIN_PASSWORD: 'una frase de paso suficientemente larga',
  };

  it('normaliza y acepta entradas válidas', () => {
    expect(readAdminInput(valid)).toEqual({
      email: 'admin@ecosoap.example',
      fullName: 'Administración',
      password: valid.ADMIN_PASSWORD,
    });
  });

  it.each([
    ['sin correo', { ...valid, ADMIN_EMAIL: undefined }],
    ['correo inválido', { ...valid, ADMIN_EMAIL: 'no-es-correo' }],
    ['sin nombre', { ...valid, ADMIN_FULL_NAME: undefined }],
    ['contraseña de 14', { ...valid, ADMIN_PASSWORD: 'catorce chars!' }],
  ])('%s → rechazo sin revelar el valor', (_name, env) => {
    expect(() => readAdminInput(env)).toThrow(AdminInputError);
    try {
      readAdminInput(env);
    } catch (error) {
      expect((error as Error).message).not.toContain('catorce chars!');
    }
  });
});

describe('Validación de JWT_SECRET al arrancar', () => {
  const env = {
    DATABASE_URL: 'postgresql://u:p@localhost:5433/db',
    FRONTEND_URL: 'http://localhost:5173',
  };

  it('rechaza un secreto ausente o el change-me de .env.example', () => {
    expect(() => validateEnv(env)).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...env, JWT_SECRET: 'change-me' })).toThrow(/JWT_SECRET/);
  });

  it('acepta un secreto de al menos 32 caracteres', () => {
    expect(() => validateEnv({ ...env, JWT_SECRET: 'x'.repeat(32) })).not.toThrow();
  });
});
