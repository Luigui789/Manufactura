import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';

import { ACCESS_POLICY } from '../src/auth/access-policy.js';
import { AuditService } from '../src/audit/audit.service.js';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  RoleCode,
} from '../src/generated/prisma/client.js';
import {
  createTestApp,
  createUser,
  deactivateOtherAdmins,
  login,
  randomPassword,
  sessionCookieFrom,
  body,
  type TestApp,
  type TestUser,
  uniqueEmail,
} from './support/auth-test-kit.js';

let kit: TestApp;
let admin: TestUser;
let adminCookie: string;

beforeAll(async () => {
  kit = await createTestApp();
  admin = await createUser(kit, RoleCode.ADMIN);
  adminCookie = await login(kit, admin);
});

afterAll(async () => {
  await kit.close();
});

const NON_ADMIN_ROLES = [
  RoleCode.COMPRAS,
  RoleCode.INVENTARIO,
  RoleCode.PRODUCCION,
  RoleCode.VENTAS,
] as const;

function auditByRequest(requestId: string) {
  return kit.prisma.auditLog.findMany({ where: { requestId } });
}

function newUserBody(role: RoleCode = RoleCode.VENTAS) {
  return {
    fullName: 'Usuario Nuevo',
    email: uniqueEmail('nuevo'),
    role,
    temporaryPassword: randomPassword(),
  };
}

describe('RBAC', () => {
  it('R1 + R2 + R3: /users solo para ADMIN; los demás roles 403; sin sesión 401', async () => {
    const target = await createUser(kit, RoleCode.VENTAS);
    const routes = [
      ['get', '/api/users'],
      ['get', `/api/users/${target.id}`],
      ['post', '/api/users'],
      ['post', `/api/users/${target.id}/enable`],
      ['post', `/api/users/${target.id}/disable`],
      ['patch', `/api/users/${target.id}/role`],
      ['post', `/api/users/${target.id}/reset-password`],
    ] as const;

    await kit.http().get('/api/users').set('Cookie', adminCookie).expect(200);
    for (const role of NON_ADMIN_ROLES) {
      const cookie = await login(kit, await createUser(kit, role));
      for (const [method, path] of routes) {
        await kit.http()[method](path).set('Cookie', cookie).send({}).expect(403);
      }
    }
    for (const [method, path] of routes) {
      await kit.http()[method](path).send({}).expect(401);
    }
  });

  it('R4: todos los roles usan me y logout', async () => {
    for (const role of [RoleCode.ADMIN, ...NON_ADMIN_ROLES]) {
      const cookie = await login(kit, await createUser(kit, role));
      await kit.http().get('/api/auth/me').set('Cookie', cookie).expect(200);
      await kit.http().post('/api/auth/logout').set('Cookie', cookie).expect(200);
    }
  });

  it('R5: toda ruta registrada declara exactamente una política de acceso', () => {
    const discovery = kit.app.get(DiscoveryService);
    const scanner = kit.app.get(MetadataScanner);
    const reflector = kit.app.get(Reflector);
    const missing: string[] = [];
    let routes = 0;

    for (const wrapper of discovery.getControllers()) {
      const controller = wrapper.metatype as (new (...args: unknown[]) => object) | null;
      if (!controller) continue;
      const prototype = controller.prototype as Record<string, unknown>;
      for (const name of scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name] as (...args: unknown[]) => unknown;
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;
        routes += 1;
        const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
        if (!reflector.getAllAndOverride(ACCESS_POLICY, [handler, controller])) {
          missing.push(`${method} ${controller.name}.${name}`);
        }
      }
    }
    expect(routes).toBeGreaterThan(10);
    expect(missing).toEqual([]);
  });
});

describe('Administración de usuarios', () => {
  it('U1 + AU4: alta con contraseña temporal, correo normalizado y CREATE auditado', async () => {
    const payload = newUserBody();
    const response = await kit
      .http()
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({ ...payload, email: `  ${payload.email.toUpperCase()}` })
      .expect(201);
    expect(body(response).data).toMatchObject({
      email: payload.email,
      role: RoleCode.VENTAS,
      isActive: true,
      mustChangePassword: true,
    });
    expect(JSON.stringify(response.body)).not.toContain(payload.temporaryPassword);

    const [log] = await auditByRequest(response.headers['x-request-id']);
    expect(log).toMatchObject({
      actorType: ActorType.USER,
      actorUserId: admin.id,
      action: AuditAction.CREATE,
      entityType: AuditEntityType.USER,
      entityId: body(response).data.id,
      previousValues: null,
      newValues: {
        email: payload.email,
        fullName: payload.fullName,
        role: RoleCode.VENTAS,
        isActive: true,
        mustChangePassword: true,
      },
    });
  });

  it('U2 + U11: correo duplicado con otras mayúsculas → 409 y sin CREATE', async () => {
    const existing = await createUser(kit, RoleCode.VENTAS);
    const response = await kit
      .http()
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({ ...newUserBody(), email: existing.email.toUpperCase() })
      .expect(409);
    expect(body(response).message).toBe('Ya existe un usuario con ese correo');
    expect(await auditByRequest(response.headers['x-request-id'])).toEqual([]);
  });

  it('U3 + U4: campos extra → 400; contraseña de 14 → 400 sin eco del valor', async () => {
    for (const extra of [
      { isActive: false },
      { passwordHash: 'x' },
      { mustChangePassword: false },
      { roleId: admin.id },
    ]) {
      await kit
        .http()
        .post('/api/users')
        .set('Cookie', adminCookie)
        .send({ ...newUserBody(), ...extra })
        .expect(400);
    }
    const shortPassword = 'catorce chars!';
    expect(shortPassword).toHaveLength(14);
    const response = await kit
      .http()
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({ ...newUserBody(), temporaryPassword: shortPassword })
      .expect(400);
    expect(JSON.stringify(response.body)).not.toContain(shortPassword);
  });

  it('U5 + AU5: activar y desactivar con snapshots; transiciones sin efecto → 409', async () => {
    const target = await createUser(kit, RoleCode.PRODUCCION);
    await kit.http().post(`/api/users/${target.id}/enable`).set('Cookie', adminCookie).expect(409);

    const disabled = await kit
      .http()
      .post(`/api/users/${target.id}/disable`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(body(disabled).data.isActive).toBe(false);
    const [disableLog] = await auditByRequest(disabled.headers['x-request-id']);
    expect(disableLog).toMatchObject({
      action: AuditAction.DISABLE,
      actorUserId: admin.id,
      entityId: target.id,
      previousValues: { isActive: true },
      newValues: { isActive: false },
    });
    await kit.http().post(`/api/users/${target.id}/disable`).set('Cookie', adminCookie).expect(409);

    const enabled = await kit
      .http()
      .post(`/api/users/${target.id}/enable`)
      .set('Cookie', adminCookie)
      .expect(200);
    const [enableLog] = await auditByRequest(enabled.headers['x-request-id']);
    expect(enableLog).toMatchObject({
      action: AuditAction.ENABLE,
      previousValues: { isActive: false },
      newValues: { isActive: true },
    });
  });

  it('A11 + AU6: cambiar el rol audita códigos e invalida la sesión del afectado', async () => {
    const target = await createUser(kit, RoleCode.VENTAS);
    const targetCookie = await login(kit, target);

    const response = await kit
      .http()
      .patch(`/api/users/${target.id}/role`)
      .set('Cookie', adminCookie)
      .send({ role: RoleCode.INVENTARIO })
      .expect(200);
    const [log] = await auditByRequest(response.headers['x-request-id']);
    expect(log).toMatchObject({
      action: AuditAction.CHANGE_ROLE,
      previousValues: { role: RoleCode.VENTAS },
      newValues: { role: RoleCode.INVENTARIO },
    });

    await kit.http().get('/api/auth/me').set('Cookie', targetCookie).expect(401);
    const fresh = await login(kit, target);
    const me = await kit.http().get('/api/auth/me').set('Cookie', fresh).expect(200);
    expect(body(me).data.role).toBe(RoleCode.INVENTARIO);

    await kit
      .http()
      .patch(`/api/users/${target.id}/role`)
      .set('Cookie', adminCookie)
      .send({ role: RoleCode.INVENTARIO })
      .expect(409);
  });

  it('A15 + AU7: restablecer revoca sesiones, obliga a cambiar y no guarda credenciales', async () => {
    const target = await createUser(kit, RoleCode.COMPRAS);
    const targetCookie = await login(kit, target);
    const temporaryPassword = randomPassword();

    const response = await kit
      .http()
      .post(`/api/users/${target.id}/reset-password`)
      .set('Cookie', adminCookie)
      .send({ temporaryPassword })
      .expect(200);
    expect(body(response).data.mustChangePassword).toBe(true);
    await kit.http().get('/api/auth/me').set('Cookie', targetCookie).expect(401);

    const [log] = await auditByRequest(response.headers['x-request-id']);
    expect(log).toMatchObject({
      action: AuditAction.RESET_PASSWORD,
      actorUserId: admin.id,
      entityId: target.id,
      previousValues: { mustChangePassword: false },
      newValues: { mustChangePassword: true },
    });
    expect(JSON.stringify(log)).not.toContain(temporaryPassword);

    const tempCookie = await login(kit, { email: target.email, password: temporaryPassword });
    const blocked = await kit.http().get('/api/users').set('Cookie', tempCookie).expect(403);
    expect(body(blocked).error).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('U6: un ADMIN no puede desactivarse, cambiarse el rol ni restablecerse', async () => {
    const before = await kit.prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    const responses = [
      await kit.http().post(`/api/users/${admin.id}/disable`).set('Cookie', adminCookie),
      await kit
        .http()
        .patch(`/api/users/${admin.id}/role`)
        .set('Cookie', adminCookie)
        .send({ role: RoleCode.VENTAS }),
      await kit
        .http()
        .post(`/api/users/${admin.id}/reset-password`)
        .set('Cookie', adminCookie)
        .send({ temporaryPassword: randomPassword() }),
    ];
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(await auditByRequest(response.headers['x-request-id'])).toEqual([]);
    }
    const after = await kit.prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(after).toEqual(before);
  });

  it('U12: paginación del servidor con meta; limit > 100 → 400; 404 y UUID inválido', async () => {
    const response = await kit
      .http()
      .get('/api/users?page=1&limit=2')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(body(response).data).toHaveLength(2);
    expect(body(response).meta).toMatchObject({ page: 1, limit: 2 });
    expect(body(response).meta.total).toBeGreaterThanOrEqual(2);
    await kit.http().get('/api/users?limit=101').set('Cookie', adminCookie).expect(400);
    await kit
      .http()
      .get('/api/users/01900000-0000-7000-8000-000000000000')
      .set('Cookie', adminCookie)
      .expect(404);
    await kit.http().get('/api/users/no-es-uuid').set('Cookie', adminCookie).expect(400);
  });
});

describe('Último ADMIN y concurrencia', () => {
  it('U7: el único ADMIN activo no puede desactivarse ni quitarse el rol', async () => {
    const solo = await createUser(kit, RoleCode.ADMIN, { prefix: 'solo-admin' });
    await deactivateOtherAdmins(kit, [solo.id]);
    const cookie = await login(kit, solo);

    await kit.http().post(`/api/users/${solo.id}/disable`).set('Cookie', cookie).expect(403);
    await kit
      .http()
      .patch(`/api/users/${solo.id}/role`)
      .set('Cookie', cookie)
      .send({ role: RoleCode.VENTAS })
      .expect(403);

    const after = await kit.prisma.user.findUniqueOrThrow({
      where: { id: solo.id },
      include: { role: true },
    });
    expect(after.isActive).toBe(true);
    expect(after.role.code).toBe(RoleCode.ADMIN);
    const successLogs = await kit.prisma.auditLog.count({
      where: {
        entityId: solo.id,
        action: { in: [AuditAction.DISABLE, AuditAction.CHANGE_ROLE] },
      },
    });
    expect(successLogs).toBe(0);
  });

  it('U8: A desactiva a B y B desactiva a A a la vez → solo una gana y queda un ADMIN', async () => {
    const a = await createUser(kit, RoleCode.ADMIN, { prefix: 'carrera-a' });
    const b = await createUser(kit, RoleCode.ADMIN, { prefix: 'carrera-b' });
    await deactivateOtherAdmins(kit, [a.id, b.id]);
    const [cookieA, cookieB] = [await login(kit, a), await login(kit, b)];

    const results = await Promise.all([
      kit.http().post(`/api/users/${b.id}/disable`).set('Cookie', cookieA),
      kit.http().post(`/api/users/${a.id}/disable`).set('Cookie', cookieB),
    ]);
    // La perdedora recibe 409 si llega al protocolo, o 401 si su actor ya fue
    // desactivado o degradado antes de autenticarse. Ambas preservan la invariante.
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect([401, 409]).toContain(statuses[1]);

    const activeAdmins = await kit.prisma.user.count({
      where: { isActive: true, role: { code: RoleCode.ADMIN } },
    });
    expect(activeAdmins).toBe(1);
    const disables = await kit.prisma.auditLog.count({
      where: { action: AuditAction.DISABLE, entityId: { in: [a.id, b.id] } },
    });
    expect(disables).toBe(1);
  });

  it('U9: carrera mixta desactivar y degradar mantiene un ADMIN activo', async () => {
    const a = await createUser(kit, RoleCode.ADMIN, { prefix: 'mixta-a' });
    const b = await createUser(kit, RoleCode.ADMIN, { prefix: 'mixta-b' });
    await deactivateOtherAdmins(kit, [a.id, b.id]);
    const [cookieA, cookieB] = [await login(kit, a), await login(kit, b)];

    const results = await Promise.all([
      kit.http().post(`/api/users/${b.id}/disable`).set('Cookie', cookieA),
      kit
        .http()
        .patch(`/api/users/${a.id}/role`)
        .set('Cookie', cookieB)
        .send({ role: RoleCode.VENTAS }),
    ]);
    // La perdedora recibe 409 si llega al protocolo, o 401 si su actor ya fue
    // desactivado o degradado antes de autenticarse. Ambas preservan la invariante.
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect([401, 409]).toContain(statuses[1]);
    const activeAdmins = await kit.prisma.user.count({
      where: { isActive: true, role: { code: RoleCode.ADMIN } },
    });
    expect(activeAdmins).toBe(1);
  });
});

describe('Atomicidad cambio + auditoría', () => {
  it('U10: si AuditLog falla, ninguna de las siete operaciones deja cambios', async () => {
    // Los escenarios previos dejaron un solo ADMIN activo; se asegura uno propio.
    const actor = await createUser(kit, RoleCode.ADMIN, { prefix: 'atomico' });
    const spare = await createUser(kit, RoleCode.ADMIN, { prefix: 'atomico-extra' });
    const actorCookie = await login(kit, actor);
    const audit = kit.app.get(AuditService);

    const snapshot = (id: string) =>
      kit.prisma.user.findUniqueOrThrow({ where: { id }, include: { role: true } });

    const failNextAudit = () =>
      vi.spyOn(audit, 'record').mockRejectedValueOnce(new Error('auditoría caída'));

    // Crear usuario
    const payload = newUserBody();
    failNextAudit();
    await kit.http().post('/api/users').set('Cookie', actorCookie).send(payload).expect(500);
    expect(await kit.prisma.user.findUnique({ where: { email: payload.email } })).toBeNull();

    const target = await createUser(kit, RoleCode.VENTAS);
    const inactive = await createUser(kit, RoleCode.VENTAS, { isActive: false });
    const cases: Array<[string, () => Promise<unknown>, string]> = [
      [
        'desactivar',
        () => kit.http().post(`/api/users/${target.id}/disable`).set('Cookie', actorCookie),
        target.id,
      ],
      [
        'activar',
        () => kit.http().post(`/api/users/${inactive.id}/enable`).set('Cookie', actorCookie),
        inactive.id,
      ],
      [
        'cambiar rol',
        () =>
          kit
            .http()
            .patch(`/api/users/${target.id}/role`)
            .set('Cookie', actorCookie)
            .send({ role: RoleCode.COMPRAS }),
        target.id,
      ],
      [
        'restablecer',
        () =>
          kit
            .http()
            .post(`/api/users/${target.id}/reset-password`)
            .set('Cookie', actorCookie)
            .send({ temporaryPassword: randomPassword() }),
        target.id,
      ],
    ];
    for (const [, run, id] of cases) {
      const before = await snapshot(id);
      failNextAudit();
      const response = (await run()) as { status: number };
      expect(response.status).toBe(500);
      expect(await snapshot(id)).toEqual(before);
    }

    // Cambiar la contraseña propia y logout
    const self = await createUser(kit, RoleCode.INVENTARIO);
    const selfCookie = await login(kit, self);
    const selfBefore = await snapshot(self.id);
    failNextAudit();
    await kit
      .http()
      .post('/api/auth/change-password')
      .set('Cookie', selfCookie)
      .send({ currentPassword: self.password, newPassword: randomPassword() })
      .expect(500);
    expect(await snapshot(self.id)).toEqual(selfBefore);

    failNextAudit();
    await kit.http().post('/api/auth/logout').set('Cookie', selfCookie).expect(500);
    expect(await snapshot(self.id)).toEqual(selfBefore);
    await kit.http().get('/api/auth/me').set('Cookie', selfCookie).expect(200);

    expect(spare.id).toBeTruthy();
    vi.restoreAllMocks();
  });

  it('la sesión renovada tras un cambio de contraseña sigue funcionando', async () => {
    const user = await createUser(kit, RoleCode.VENTAS);
    const cookie = await login(kit, user);
    const response = await kit
      .http()
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: user.password, newPassword: randomPassword() })
      .expect(200);
    await kit.http().get('/api/auth/me').set('Cookie', sessionCookieFrom(response)).expect(200);
  });
});
