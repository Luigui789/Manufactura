import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuditService } from '../src/audit/audit.service.js';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  RoleCode,
  type Warehouse,
} from '../src/generated/prisma/client.js';
import {
  createTestApp,
  createUser,
  login,
  type TestApp,
  type TestUser,
} from './support/auth-test-kit.js';

let kit: TestApp;
let actor: TestUser;
let cookie: string;

beforeAll(async () => {
  kit = await createTestApp();
  actor = await createUser(kit, RoleCode.INVENTARIO);
  cookie = await login(kit, actor);
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  if (kit) await kit.close();
});

type WarehouseJson = Omit<Warehouse, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

function warehouseData(response: { body: unknown }): WarehouseJson {
  return (response.body as { data: WarehouseJson }).data;
}

function newWarehouse() {
  return {
    code: `ALM-${randomUUID()}`.toUpperCase(),
    name: 'Almacén de pruebas',
    location: 'Nave Norte',
  };
}

async function createWarehouse() {
  const response = await kit
    .http()
    .post('/api/warehouses')
    .set('Cookie', cookie)
    .send(newWarehouse())
    .expect(201);
  return warehouseData(response);
}

function auditFor(response: { headers: Record<string, unknown> }) {
  const requestId = response.headers['x-request-id'];
  expect(requestId).toEqual(expect.any(String));
  return kit.prisma.auditLog.findMany({ where: { requestId: requestId as string } });
}

describe('Almacenes: API, permisos y auditoría', () => {
  it.each([undefined, true, false])('crea con isActive=%s y registra CREATE', async (isActive) => {
    const payload = newWarehouse();
    const expectedActive = isActive ?? true;
    const response = await kit
      .http()
      .post('/api/warehouses')
      .set('Cookie', cookie)
      .send({
        ...payload,
        code: ` ${payload.code.toLowerCase()} `,
        name: ` ${payload.name} `,
        location: ` ${payload.location} `,
        isActive,
      })
      .expect(201);
    const warehouse = warehouseData(response);

    expect(warehouse).toMatchObject({ ...payload, isActive: expectedActive });
    expect(
      await kit.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } }),
    ).toMatchObject({ ...payload, isActive: expectedActive });

    const logs = await auditFor(response);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorType: ActorType.USER,
      actorUserId: actor.id,
      action: AuditAction.CREATE,
      entityType: AuditEntityType.WAREHOUSE,
      entityId: warehouse.id,
      previousValues: null,
      newValues: { ...payload, isActive: expectedActive },
    });
  });

  it('consulta el detalle y pagina desde el servidor', async () => {
    const warehouse = await createWarehouse();
    await createWarehouse();

    const detail = await kit
      .http()
      .get(`/api/warehouses/${warehouse.id}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(warehouseData(detail)).toEqual(warehouse);

    const pages: Array<{
      data: WarehouseJson[];
      meta: { page: number; limit: number; total: number };
    }> = [];
    const total = await kit.prisma.warehouse.count();

    for (const page of [1, 2]) {
      const response = await kit
        .http()
        .get(`/api/warehouses?page=${page}&limit=1`)
        .set('Cookie', cookie)
        .expect(200);
      const result = response.body as (typeof pages)[number];
      expect(result.meta).toEqual({ page, limit: 1, total });
      expect(result.data).toHaveLength(1);
      pages.push(result);
    }

    expect(pages[0].data[0].id).not.toBe(pages[1].data[0].id);
  });

  it('edita código, nombre y ubicación y audita los cambios', async () => {
    const warehouse = await createWarehouse();
    const changes = {
      code: `EDIT-${randomUUID()}`.toUpperCase(),
      name: 'Almacén actualizado',
      location: 'Nave Sur',
    };
    const response = await kit
      .http()
      .patch(`/api/warehouses/${warehouse.id}`)
      .set('Cookie', cookie)
      .send({ ...changes, code: ` ${changes.code.toLowerCase()} ` })
      .expect(200);

    expect(warehouseData(response)).toMatchObject({ ...changes, isActive: true });
    expect(
      await kit.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } }),
    ).toMatchObject(changes);
    const logs = await auditFor(response);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorUserId: actor.id,
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.WAREHOUSE,
      entityId: warehouse.id,
      previousValues: {
        code: warehouse.code,
        name: warehouse.name,
        location: warehouse.location,
      },
      newValues: changes,
    });
  });

  it('permite cambiar solo la ubicación y audita únicamente ese campo', async () => {
    const warehouse = await createWarehouse();
    const response = await kit
      .http()
      .patch(`/api/warehouses/${warehouse.id}`)
      .set('Cookie', cookie)
      .send({ location: 'Zona de recepción' })
      .expect(200);
    const expected = {
      code: warehouse.code,
      name: warehouse.name,
      location: 'Zona de recepción',
      isActive: warehouse.isActive,
    };

    expect(warehouseData(response)).toMatchObject(expected);
    expect(
      await kit.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } }),
    ).toMatchObject(expected);
    const logs = await auditFor(response);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe(AuditAction.UPDATE);
    expect(logs[0].previousValues).toEqual({ location: warehouse.location });
    expect(logs[0].newValues).toEqual({ location: 'Zona de recepción' });
  });

  it('desactiva y reactiva sin borrar; repetir el estado devuelve 409', async () => {
    const warehouse = await createWarehouse();

    for (const isActive of [false, true]) {
      const response = await kit
        .http()
        .patch(`/api/warehouses/${warehouse.id}/status`)
        .set('Cookie', cookie)
        .send({ isActive })
        .expect(200);

      expect(warehouseData(response).isActive).toBe(isActive);
      expect(
        await kit.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } }),
      ).toMatchObject({ isActive });

      const logs = await auditFor(response);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        actorUserId: actor.id,
        action: isActive ? AuditAction.ENABLE : AuditAction.DISABLE,
        entityType: AuditEntityType.WAREHOUSE,
        entityId: warehouse.id,
        previousValues: { isActive: !isActive },
        newValues: { isActive },
      });

      const repeated = await kit
        .http()
        .patch(`/api/warehouses/${warehouse.id}/status`)
        .set('Cookie', cookie)
        .send({ isActive })
        .expect(409);

      expect(await auditFor(repeated)).toHaveLength(0);
    }
  });

  it.each([
    { code: 'AB' },
    { code: 'X'.repeat(51) },
    { name: ' ' },
    { name: 123 },
    { name: 'X'.repeat(101) },
    { location: undefined },
    { location: null },
    { location: ' ' },
    { location: 'X'.repeat(256) },
    { isActive: 'false' },
    { isActive: 0 },
    { isActive: null },
    { extra: true },
  ])('rechaza un alta inválida: %j', async (invalid) => {
    const total = await kit.prisma.warehouse.count();
    const response = await kit
      .http()
      .post('/api/warehouses')
      .set('Cookie', cookie)
      .send({ ...newWarehouse(), ...invalid })
      .expect(400);
    expect(await kit.prisma.warehouse.count()).toBe(total);
    expect(await auditFor(response)).toHaveLength(0);
  });

  it('rechaza códigos duplicados al crear y editar sin dejar cambios', async () => {
    const first = await createWarehouse();
    const second = await createWarehouse();
    const before = await kit.prisma.warehouse.findUniqueOrThrow({ where: { id: second.id } });
    const total = await kit.prisma.warehouse.count();

    const duplicate = await kit
      .http()
      .post('/api/warehouses')
      .set('Cookie', cookie)
      .send({ ...newWarehouse(), code: first.code.toLowerCase() })
      .expect(409);

    const update = await kit
      .http()
      .patch(`/api/warehouses/${second.id}`)
      .set('Cookie', cookie)
      .send({ code: first.code.toLowerCase() })
      .expect(409);

    expect(await kit.prisma.warehouse.count()).toBe(total);
    expect(await kit.prisma.warehouse.findUniqueOrThrow({ where: { id: second.id } })).toEqual(
      before,
    );
    expect(await auditFor(duplicate)).toHaveLength(0);
    expect(await auditFor(update)).toHaveLength(0);
  });

  it('rechaza edición vacía, null y cambios de estado por el endpoint general', async () => {
    const warehouse = await createWarehouse();
    const before = await kit.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } });

    for (const payload of [
      {},
      { name: null },
      { location: null },
      { location: '' },
      { isActive: false },
    ]) {
      await kit
        .http()
        .patch(`/api/warehouses/${warehouse.id}`)
        .set('Cookie', cookie)
        .send(payload)
        .expect(400);
    }

    for (const isActive of ['false', 0, null]) {
      await kit
        .http()
        .patch(`/api/warehouses/${warehouse.id}/status`)
        .set('Cookie', cookie)
        .send({ isActive })
        .expect(400);
    }

    expect(await kit.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } })).toEqual(
      before,
    );
  });

  it('devuelve 400 para UUID y paginación inválidos, y 404 para un almacén inexistente', async () => {
    await kit.http().get('/api/warehouses/no-es-uuid').set('Cookie', cookie).expect(400);
    await kit.http().get('/api/warehouses?limit=101').set('Cookie', cookie).expect(400);

    const id = randomUUID();

    await kit.http().get(`/api/warehouses/${id}`).set('Cookie', cookie).expect(404);
    await kit
      .http()
      .patch(`/api/warehouses/${id}`)
      .set('Cookie', cookie)
      .send({ name: 'Inexistente' })
      .expect(404);
    await kit
      .http()
      .patch(`/api/warehouses/${id}/status`)
      .set('Cookie', cookie)
      .send({ isActive: false })
      .expect(404);
  });

  it('exige sesión en los cinco endpoints', async () => {
    const id = randomUUID();

    await kit.http().get('/api/warehouses').expect(401);
    await kit.http().get(`/api/warehouses/${id}`).expect(401);
    await kit.http().post('/api/warehouses').send(newWarehouse()).expect(401);
    await kit.http().patch(`/api/warehouses/${id}`).send({ name: 'Cambio' }).expect(401);
    await kit.http().patch(`/api/warehouses/${id}/status`).send({ isActive: false }).expect(401);
  });

  it.each([RoleCode.COMPRAS, RoleCode.PRODUCCION, RoleCode.VENTAS])(
    '%s puede consultar, pero no crear, editar ni cambiar el estado',
    async (role) => {
      const readerCookie = await login(kit, await createUser(kit, role));
      const warehouse = await createWarehouse();
      const before = await kit.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } });
      const payload = newWarehouse();

      await kit.http().get('/api/warehouses').set('Cookie', readerCookie).expect(200);
      await kit
        .http()
        .get(`/api/warehouses/${warehouse.id}`)
        .set('Cookie', readerCookie)
        .expect(200);
      await kit
        .http()
        .post('/api/warehouses')
        .set('Cookie', readerCookie)
        .send(payload)
        .expect(403);
      await kit
        .http()
        .patch(`/api/warehouses/${warehouse.id}`)
        .set('Cookie', readerCookie)
        .send({ name: 'Cambio prohibido' })
        .expect(403);
      await kit
        .http()
        .patch(`/api/warehouses/${warehouse.id}`)
        .set('Cookie', readerCookie)
        .send({ isActive: false })
        .expect(403);

      expect(await kit.prisma.warehouse.findUnique({ where: { code: payload.code } })).toBeNull();
      expect(await kit.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } })).toEqual(
        before,
      );
    },
  );

  it('ADMIN también puede crear, editar y desactivar', async () => {
    const adminCookie = await login(kit, await createUser(kit, RoleCode.ADMIN));
    const response = await kit
      .http()
      .post('/api/warehouses')
      .set('Cookie', adminCookie)
      .send(newWarehouse())
      .expect(201);

    const { id } = warehouseData(response);

    await kit
      .http()
      .patch(`/api/warehouses/${id}`)
      .set('Cookie', adminCookie)
      .send({ name: 'Modificado por ADMIN' })
      .expect(200);
    await kit
      .http()
      .patch(`/api/warehouses/${id}/status`)
      .set('Cookie', adminCookie)
      .send({ isActive: false })
      .expect(200);

    expect(await kit.prisma.warehouse.findUniqueOrThrow({ where: { id } })).toMatchObject({
      name: 'Modificado por ADMIN',
      isActive: false,
    });
  });

  it('revierte creación, edición y ambos cambios de estado si falla la auditoría', async () => {
    const audit = kit.app.get(AuditService);
    const originalRecord = audit.record.bind(audit);

    for (const operation of ['create', 'update', 'disable', 'enable']) {
      const warehouse = await createWarehouse();
      const payload = newWarehouse();

      if (operation === 'enable') {
        await kit
          .http()
          .patch(`/api/warehouses/${warehouse.id}/status`)
          .set('Cookie', cookie)
          .send({ isActive: false })
          .expect(200);
      }

      const before = await kit.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } });

      // El almacén y el evento deben revertirse aunque el evento ya se haya insertado.
      vi.spyOn(audit, 'record').mockImplementationOnce(async (writer, event) => {
        await originalRecord(writer, event);
        throw new Error('Fallo simulado de auditoría de almacenes');
      });

      const request =
        operation === 'create'
          ? kit.http().post('/api/warehouses').send(payload)
          : operation === 'update'
            ? kit
                .http()
                .patch(`/api/warehouses/${warehouse.id}`)
                .send({ name: 'No debe persistir' })
            : kit
                .http()
                .patch(`/api/warehouses/${warehouse.id}/status`)
                .send({ isActive: operation === 'enable' });

      const response = await request.set('Cookie', cookie).expect(500);

      expect(await auditFor(response)).toHaveLength(0);
      expect(await kit.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } })).toEqual(
        before,
      );

      if (operation === 'create') {
        expect(await kit.prisma.warehouse.findUnique({ where: { code: payload.code } })).toBeNull();
      }

      vi.restoreAllMocks();
    }
  });
});
