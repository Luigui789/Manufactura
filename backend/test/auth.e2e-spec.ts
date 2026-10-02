import { JwtService } from '@nestjs/jwt';

import { SESSION_COOKIE } from '../src/auth/session-cookie.js';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  RoleCode,
} from '../src/generated/prisma/client.js';
import {
  createTestApp,
  createUser,
  login,
  randomPassword,
  sessionCookieFrom,
  body,
  type TestApp,
  uniqueEmail,
} from './support/auth-test-kit.js';

let kit: TestApp;

beforeAll(async () => {
  kit = await createTestApp();
});

afterAll(async () => {
  await kit.close();
});

function auditByRequest(requestId: string) {
  return kit.prisma.auditLog.findMany({ where: { requestId } });
}

describe('Login', () => {
  it('A1 + AU1: login válido emite la cookie segura, no expone secretos y audita LOGIN', async () => {
    const user = await createUser(kit, RoleCode.VENTAS);
    const response = await kit
      .http()
      .post('/api/auth/login')
      .send({ email: ` ${user.email.toUpperCase()} `, password: user.password })
      .expect(200);

    const setCookie = (response.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith(`${SESSION_COOKIE}=`),
    );
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/Max-Age=28800/);

    const body = JSON.stringify(response.body);
    const token = sessionCookieFrom(response).split('=')[1];
    expect(body).not.toContain(user.password);
    expect(body).not.toContain('$argon2id$');
    expect(body).not.toContain(token);
    expect(response.body).toMatchObject({
      data: { id: user.id, email: user.email, role: RoleCode.VENTAS, mustChangePassword: false },
      message: 'Sesión iniciada',
    });

    const [log] = await auditByRequest(response.headers['x-request-id']);
    expect(log).toMatchObject({
      actorType: ActorType.USER,
      actorUserId: user.id,
      action: AuditAction.LOGIN,
      entityType: AuditEntityType.USER,
      entityId: user.id,
    });
    expect(log.ipAddress).toBeTruthy();
  });

  it('A2 + AU2: contraseña incorrecta → 401 genérico; LOGIN_FAILED anónimo sobre la cuenta', async () => {
    const user = await createUser(kit, RoleCode.COMPRAS);
    const response = await kit
      .http()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'otra contraseña cualquiera' })
      .expect(401);
    expect(body(response).message).toBe('Credenciales inválidas');
    expect(response.headers['set-cookie']).toBeUndefined();

    const [log] = await auditByRequest(response.headers['x-request-id']);
    expect(log).toMatchObject({
      actorType: ActorType.ANONYMOUS,
      actorUserId: null,
      action: AuditAction.LOGIN_FAILED,
      entityType: AuditEntityType.USER,
      entityId: user.id,
    });
  });

  it('A3 + AU3: correo inexistente → mismo 401; LOGIN_FAILED sin entidad ni correo guardado', async () => {
    const email = uniqueEmail('inexistente');
    const response = await kit
      .http()
      .post('/api/auth/login')
      .send({ email, password: 'una contraseña cualquiera' })
      .expect(401);
    expect(body(response).message).toBe('Credenciales inválidas');

    const [log] = await auditByRequest(response.headers['x-request-id']);
    expect(log).toMatchObject({
      actorType: ActorType.ANONYMOUS,
      actorUserId: null,
      action: AuditAction.LOGIN_FAILED,
      entityType: null,
      entityId: null,
      previousValues: null,
      newValues: null,
    });
    expect(JSON.stringify(log)).not.toContain(email);
  });

  it('A4: usuario inactivo con contraseña correcta → mismo 401 y sin cookie', async () => {
    const user = await createUser(kit, RoleCode.INVENTARIO, { isActive: false });
    const response = await kit
      .http()
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(401);
    expect(body(response).message).toBe('Credenciales inválidas');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rechaza campos no declarados en el login', async () => {
    await kit
      .http()
      .post('/api/auth/login')
      .send({ email: 'a@example.test', password: 'x', role: 'ADMIN' })
      .expect(400);
  });
});

describe('Sesión', () => {
  it('A5: /me con cookie válida devuelve el usuario actual', async () => {
    const user = await createUser(kit, RoleCode.PRODUCCION);
    const cookie = await login(kit, user);
    const response = await kit.http().get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(body(response).data).toMatchObject({ id: user.id, role: RoleCode.PRODUCCION });
    expect(body(response).data).not.toHaveProperty('passwordHash');
    expect(body(response).data).not.toHaveProperty('tokenVersion');
  });

  it('A6: /me sin cookie → 401', async () => {
    await kit.http().get('/api/auth/me').expect(401);
  });

  it('A7: firma inválida, payload alterado o alg none → 401', async () => {
    const user = await createUser(kit, RoleCode.VENTAS);
    const cookie = await login(kit, user);
    const token = cookie.split('=')[1];
    const [header, payload, signature] = token.split('.');

    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: user.id, ver: 0, role: 'ADMIN' }),
    ).toString('base64url');
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    );

    for (const forged of [
      `${header}.${payload}.${signature.slice(0, -4)}AAAA`,
      `${header}.${forgedPayload}.${signature}`,
      `${noneHeader}.${payload}.`,
    ]) {
      await kit.http().get('/api/auth/me').set('Cookie', `${SESSION_COOKIE}=${forged}`).expect(401);
    }
  });

  it('A8: JWT expirado → 401', async () => {
    const user = await createUser(kit, RoleCode.VENTAS);
    const expired = await kit.app
      .get(JwtService)
      .signAsync({ sub: user.id, ver: 0 }, { expiresIn: -10 });
    await kit.http().get('/api/auth/me').set('Cookie', `${SESSION_COOKIE}=${expired}`).expect(401);
  });

  it('A9: desactivar al usuario invalida su sesión en la siguiente petición', async () => {
    const user = await createUser(kit, RoleCode.VENTAS);
    const cookie = await login(kit, user);
    await kit.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    await kit.http().get('/api/auth/me').set('Cookie', cookie).expect(401);
  });

  it('A10 + AU8: el logout es global y audita LOGOUT', async () => {
    const user = await createUser(kit, RoleCode.COMPRAS);
    const first = await login(kit, user);
    const second = await login(kit, user);

    const response = await kit.http().post('/api/auth/logout').set('Cookie', first).expect(200);
    expect(response.headers['set-cookie']?.[0]).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));

    await kit.http().get('/api/auth/me').set('Cookie', first).expect(401);
    await kit.http().get('/api/auth/me').set('Cookie', second).expect(401);

    const [log] = await auditByRequest(response.headers['x-request-id']);
    expect(log).toMatchObject({
      actorType: ActorType.USER,
      actorUserId: user.id,
      action: AuditAction.LOGOUT,
      entityType: AuditEntityType.USER,
      entityId: user.id,
    });
  });
});

describe('Protección de origen', () => {
  it('A13: rechaza POST cross-site o same-site de un origen no confiable', async () => {
    const user = await createUser(kit, RoleCode.VENTAS);
    await kit
      .http()
      .post('/api/auth/login')
      .set('Sec-Fetch-Site', 'cross-site')
      .set('Origin', 'https://atacante.example')
      .send({ email: user.email, password: user.password })
      .expect(403);
    await kit
      .http()
      .post('/api/auth/login')
      .set('Sec-Fetch-Site', 'same-site')
      .set('Origin', 'http://localhost:8080')
      .send({ email: user.email, password: user.password })
      .expect(403);
  });

  it('permite el frontend de confianza y las peticiones del mismo origen', async () => {
    const user = await createUser(kit, RoleCode.VENTAS);
    await kit
      .http()
      .post('/api/auth/login')
      .set('Sec-Fetch-Site', 'same-site')
      .set('Origin', process.env.FRONTEND_URL ?? 'http://localhost:5173')
      .send({ email: user.email, password: user.password })
      .expect(200);
    await kit
      .http()
      .post('/api/auth/login')
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ email: user.email, password: user.password })
      .expect(200);
  });
});

describe('Cambio de contraseña', () => {
  it('A14: revoca las otras sesiones, renueva la actual y rechaza actual incorrecta o igual', async () => {
    const user = await createUser(kit, RoleCode.INVENTARIO);
    const other = await login(kit, user);
    const current = await login(kit, user);

    await kit
      .http()
      .post('/api/auth/change-password')
      .set('Cookie', current)
      .send({ currentPassword: 'no es la contraseña', newPassword: randomPassword() })
      .expect(422);
    await kit
      .http()
      .post('/api/auth/change-password')
      .set('Cookie', current)
      .send({ currentPassword: user.password, newPassword: user.password })
      .expect(422);

    const newPassword = randomPassword();
    const response = await kit
      .http()
      .post('/api/auth/change-password')
      .set('Cookie', current)
      .send({ currentPassword: user.password, newPassword })
      .expect(200);
    const renewed = sessionCookieFrom(response);

    await kit.http().get('/api/auth/me').set('Cookie', other).expect(401);
    await kit.http().get('/api/auth/me').set('Cookie', current).expect(401);
    await kit.http().get('/api/auth/me').set('Cookie', renewed).expect(200);
    await login(kit, { email: user.email, password: newPassword });
  });

  it('A16 + AU7: con cambio pendiente solo se permiten me, change-password y logout', async () => {
    const user = await createUser(kit, RoleCode.ADMIN, { mustChangePassword: true });
    const cookie = await login(kit, user);

    const blocked = await kit.http().get('/api/users').set('Cookie', cookie).expect(403);
    expect(body(blocked).error).toBe('PASSWORD_CHANGE_REQUIRED');
    const me = await kit.http().get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(body(me).data.mustChangePassword).toBe(true);

    const changed = await kit
      .http()
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: user.password, newPassword: randomPassword() })
      .expect(200);
    expect(body(changed).data.mustChangePassword).toBe(false);

    const [log] = await auditByRequest(changed.headers['x-request-id']);
    expect(log).toMatchObject({
      action: AuditAction.CHANGE_PASSWORD,
      actorUserId: user.id,
      previousValues: { mustChangePassword: true },
      newValues: { mustChangePassword: false },
    });

    await kit.http().get('/api/users').set('Cookie', sessionCookieFrom(changed)).expect(200);
  });
});
