import { AuditAction, RoleCode } from '../src/generated/prisma/client.js';
import { createTestApp, createUser, type TestApp } from './support/auth-test-kit.js';

/**
 * Única suite con el límite real (10 por minuto e IP). Cada archivo crea su
 * propia aplicación y, con ella, su propio contador en memoria.
 */
let kit: TestApp;

beforeAll(async () => {
  kit = await createTestApp({ throttle: true });
});

afterAll(async () => {
  await kit.close();
});

it('A12: el undécimo intento en un minuto recibe 429 y no se audita', async () => {
  const user = await createUser(kit, RoleCode.VENTAS);
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    await kit
      .http()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'intento incorrecto' })
      .expect(401);
  }
  const limited = await kit
    .http()
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(429);

  const rows = await kit.prisma.auditLog.count({
    where: { requestId: limited.headers['x-request-id'] },
  });
  expect(rows).toBe(0);
  const failures = await kit.prisma.auditLog.count({
    where: { entityId: user.id, action: AuditAction.LOGIN_FAILED },
  });
  expect(failures).toBe(10);
});
