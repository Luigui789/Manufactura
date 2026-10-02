import type { LoggerService } from '@nestjs/common';

import { ActorType, AuditAction, RoleCode } from '../src/generated/prisma/client.js';
import { BootstrapRefusedError, UsersService } from '../src/users/users.service.js';
import {
  createTestApp,
  createUser,
  deactivateOtherAdmins,
  login,
  randomPassword,
  sessionCookieFrom,
  type TestApp,
  uniqueEmail,
} from './support/auth-test-kit.js';

let kit: TestApp;
const logLines: string[] = [];

const capturingLogger: LoggerService = {
  log: (...args: unknown[]) => logLines.push(JSON.stringify(args)),
  error: (...args: unknown[]) => logLines.push(JSON.stringify(args)),
  warn: (...args: unknown[]) => logLines.push(JSON.stringify(args)),
  debug: (...args: unknown[]) => logLines.push(JSON.stringify(args)),
  verbose: (...args: unknown[]) => logLines.push(JSON.stringify(args)),
};

beforeAll(async () => {
  kit = await createTestApp();
  kit.app.useLogger(capturingLogger);
});

afterAll(async () => {
  await kit.close();
});

describe('admin:create (solo bootstrap)', () => {
  it('B1 + AU9: sin ADMIN activo crea el primero sin cambio obligatorio y audita SYSTEM', async () => {
    await deactivateOtherAdmins(kit, []);
    const users = kit.app.get(UsersService);
    const email = uniqueEmail('primer-admin');
    const password = randomPassword();

    const created = await users.createInitialAdmin({ email, fullName: 'Primer Admin', password });
    expect(created).toMatchObject({
      email,
      role: RoleCode.ADMIN,
      isActive: true,
      mustChangePassword: false,
    });

    const log = await kit.prisma.auditLog.findFirstOrThrow({
      where: { entityId: created.id, action: AuditAction.CREATE },
    });
    expect(log).toMatchObject({
      actorType: ActorType.SYSTEM,
      actorUserId: null,
      requestId: null,
      ipAddress: null,
      newValues: { email, role: RoleCode.ADMIN, mustChangePassword: false },
    });
    await login(kit, { email, password });
  });

  it('B2: con un ADMIN activo se niega y no crea nada', async () => {
    const email = uniqueEmail('segundo-admin');
    await expect(
      kit.app
        .get(UsersService)
        .createInitialAdmin({ email, fullName: 'Segundo', password: randomPassword() }),
    ).rejects.toBeInstanceOf(BootstrapRefusedError);
    expect(await kit.prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it('B3: si el correo existe falla y no cambia contraseña, rol ni estado', async () => {
    const existing = await createUser(kit, RoleCode.VENTAS, { isActive: false });
    const before = await kit.prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    await deactivateOtherAdmins(kit, []);

    await expect(
      kit.app.get(UsersService).createInitialAdmin({
        email: existing.email,
        fullName: 'Intento',
        password: randomPassword(),
      }),
    ).rejects.toBeInstanceOf(BootstrapRefusedError);
    expect(await kit.prisma.user.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(before);
  });
});

describe('Información sensible', () => {
  it('S1 + S2 + S3: ninguna contraseña, hash, JWT ni JWT_SECRET en respuestas, auditoría o logs', async () => {
    const startedAt = new Date();
    const admin = await createUser(kit, RoleCode.ADMIN);
    await deactivateOtherAdmins(kit, [admin.id]);
    const adminCookie = await login(kit, admin);
    const responses: unknown[] = [];
    const secrets = [admin.password, process.env.JWT_SECRET ?? ''];

    const failed = await kit
      .http()
      .post('/api/auth/login')
      .send({ email: admin.email, password: 'contraseña equivocada visible' });
    secrets.push('contraseña equivocada visible');
    responses.push(failed.body);

    const temporaryPassword = randomPassword();
    secrets.push(temporaryPassword);
    const created = await kit
      .http()
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({
        fullName: 'Secreto',
        email: uniqueEmail('secreto'),
        role: RoleCode.VENTAS,
        temporaryPassword,
      })
      .expect(201);
    responses.push(created.body);

    const userId = (created.body as { data: { id: string } }).data.id;
    const resetPassword = randomPassword();
    secrets.push(resetPassword);
    responses.push(
      (
        await kit
          .http()
          .post(`/api/users/${userId}/reset-password`)
          .set('Cookie', adminCookie)
          .send({ temporaryPassword: resetPassword })
          .expect(200)
      ).body,
    );

    const userLogin = await kit
      .http()
      .post('/api/auth/login')
      .send({
        email: (created.body as { data: { email: string } }).data.email,
        password: resetPassword,
      })
      .expect(200);
    const userCookie = sessionCookieFrom(userLogin);
    secrets.push(userCookie.split('=')[1]);
    responses.push(userLogin.body);

    const finalPassword = randomPassword();
    secrets.push(finalPassword);
    const changed = await kit
      .http()
      .post('/api/auth/change-password')
      .set('Cookie', userCookie)
      .send({ currentPassword: resetPassword, newPassword: finalPassword })
      .expect(200);
    secrets.push(sessionCookieFrom(changed).split('=')[1]);
    responses.push(changed.body);

    const tooShort = 'corta y visible';
    secrets.push(tooShort);
    responses.push(
      (
        await kit
          .http()
          .post('/api/users')
          .set('Cookie', adminCookie)
          .send({ fullName: 'X', email: 'no-es-correo', role: 'NADA', temporaryPassword: tooShort })
          .expect(400)
      ).body,
    );

    responses.push((await kit.http().get('/api/users').set('Cookie', adminCookie)).body);
    responses.push((await kit.http().get('/api/auth/me').set('Cookie', adminCookie)).body);

    const hashes = await kit.prisma.user.findMany({
      where: { id: { in: [admin.id, userId] } },
      select: { passwordHash: true },
    });
    secrets.push(...hashes.map((row) => row.passwordHash));

    const auditRows = await kit.prisma.auditLog.findMany({
      where: { createdAt: { gte: startedAt } },
    });
    expect(auditRows.length).toBeGreaterThan(4);

    const haystacks = {
      responses: JSON.stringify(responses),
      audit: JSON.stringify(auditRows),
      logs: logLines.join('\n'),
    };
    for (const [where, text] of Object.entries(haystacks)) {
      expect(text, where).not.toContain('$argon2id$');
      for (const secret of secrets.filter(Boolean)) {
        expect(text.includes(secret), `${where} contiene un secreto`).toBe(false);
      }
    }
  });
});
