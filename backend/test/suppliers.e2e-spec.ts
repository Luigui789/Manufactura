import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuditService } from '../src/audit/audit.service.js';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  RoleCode,
  type Supplier,
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
  actor = await createUser(kit, RoleCode.COMPRAS);
  cookie = await login(kit, actor);
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  if (kit) await kit.close();
});

type SupplierJson = Omit<Supplier, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

function supplierData(response: { body: unknown }): SupplierJson {
  return (response.body as { data: SupplierJson }).data;
}

function newSupplier() {
  return {
    code: `PROV-${randomUUID()}`.toUpperCase(),
    name: 'Recicladora del Pacífico S.A.',
    taxId: 'J0310000000001',
    email: 'compras@recicladora.com.ni',
    phone: '+505 2222-0000',
    address: 'Km 7 Carretera Norte, Managua',
  };
}

async function createSupplier() {
  const response = await kit
    .http()
    .post('/api/suppliers')
    .set('Cookie', cookie)
    .send(newSupplier())
    .expect(201);
  return supplierData(response);
}

function auditFor(response: { headers: Record<string, unknown> }) {
  const requestId = response.headers['x-request-id'];
  expect(requestId).toEqual(expect.any(String));
  return kit.prisma.auditLog.findMany({ where: { requestId: requestId as string } });
}

describe('Proveedores: API, permisos y auditoría', () => {
  it('crea un proveedor normalizado y registra CREATE con la lista permitida', async () => {
    const payload = newSupplier();
    const response = await kit
      .http()
      .post('/api/suppliers')
      .set('Cookie', cookie)
      .send({
        ...payload,
        code: `  ${payload.code.toLowerCase()}  `,
        name: `  ${payload.name}  `,
        email: '  Compras@Recicladora.COM.ni ',
      })
      .expect(201);
    const supplier = supplierData(response);

    expect(response.body).toMatchObject({ message: 'Proveedor creado' });
    expect(supplier).toMatchObject({ ...payload, isActive: true });

    const logs = await auditFor(response);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorType: ActorType.USER,
      actorUserId: actor.id,
      action: AuditAction.CREATE,
      entityType: AuditEntityType.SUPPLIER,
      entityId: supplier.id,
      previousValues: null,
      newValues: { ...payload, isActive: true },
    });
  });

  it('crea un proveedor solo con código y nombre; el contacto queda en null', async () => {
    const { code, name } = newSupplier();
    const response = await kit
      .http()
      .post('/api/suppliers')
      .set('Cookie', cookie)
      .send({ code, name })
      .expect(201);

    expect(supplierData(response)).toMatchObject({
      code,
      name,
      taxId: null,
      email: null,
      phone: null,
      address: null,
    });
  });

  it('consulta el detalle y pagina desde el servidor', async () => {
    const supplier = await createSupplier();
    await createSupplier();

    const detail = await kit
      .http()
      .get(`/api/suppliers/${supplier.id}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(detail.body).toEqual({ data: supplier, message: 'Proveedor encontrado' });

    const total = await kit.prisma.supplier.count();
    const ids: string[] = [];

    for (const page of [1, 2]) {
      const response = await kit
        .http()
        .get(`/api/suppliers?page=${page}&limit=1`)
        .set('Cookie', cookie)
        .expect(200);
      const result = response.body as { data: SupplierJson[]; meta: unknown };
      expect(result.meta).toEqual({ page, limit: 1, total });
      expect(result.data).toHaveLength(1);
      ids.push(result.data[0].id);
    }

    expect(ids[0]).not.toBe(ids[1]);
  });

  it('edita solo los campos enviados y audita únicamente lo que cambió', async () => {
    const supplier = await createSupplier();
    const response = await kit
      .http()
      .patch(`/api/suppliers/${supplier.id}`)
      .set('Cookie', cookie)
      .send({ phone: '+505 8888-0000', address: null })
      .expect(200);

    expect(supplierData(response)).toMatchObject({
      name: supplier.name,
      email: supplier.email,
      phone: '+505 8888-0000',
      address: null,
    });

    const logs = await auditFor(response);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.SUPPLIER,
      entityId: supplier.id,
      previousValues: { phone: supplier.phone, address: supplier.address },
      newValues: { phone: '+505 8888-0000', address: null },
    });
  });

  it('una edición que conserva los valores no genera UPDATE', async () => {
    const supplier = await createSupplier();
    const response = await kit
      .http()
      .patch(`/api/suppliers/${supplier.id}`)
      .set('Cookie', cookie)
      .send({ name: supplier.name })
      .expect(200);

    expect(await auditFor(response)).toHaveLength(0);
  });

  it('desactiva y reactiva sin borrar; repetir el estado devuelve 409', async () => {
    const supplier = await createSupplier();

    for (const isActive of [false, true]) {
      const response = await kit
        .http()
        .patch(`/api/suppliers/${supplier.id}/status`)
        .set('Cookie', cookie)
        .send({ isActive })
        .expect(200);

      expect(supplierData(response).isActive).toBe(isActive);

      const logs = await auditFor(response);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        action: isActive ? AuditAction.ENABLE : AuditAction.DISABLE,
        previousValues: { isActive: !isActive },
        newValues: { isActive },
      });

      const repeated = await kit
        .http()
        .patch(`/api/suppliers/${supplier.id}/status`)
        .set('Cookie', cookie)
        .send({ isActive })
        .expect(409);

      expect(await auditFor(repeated)).toHaveLength(0);
    }
  });

  it.each([
    { code: 'AB' },
    { code: 'X'.repeat(51) },
    { code: 12345 },
    { name: '   ' },
    { name: 'X'.repeat(201) },
    { name: null },
    { taxId: '' },
    { taxId: 'X'.repeat(51) },
    { email: 'no-es-correo' },
    { phone: 'X'.repeat(51) },
    { address: '   ' },
    { address: 'X'.repeat(256) },
    { isActive: false },
    { extra: true },
  ])('rechaza un alta inválida: %j', async (invalid) => {
    const total = await kit.prisma.supplier.count();
    const response = await kit
      .http()
      .post('/api/suppliers')
      .set('Cookie', cookie)
      .send({ ...newSupplier(), ...invalid })
      .expect(400);

    expect(await kit.prisma.supplier.count()).toBe(total);
    expect(await auditFor(response)).toHaveLength(0);
  });

  it('rechaza códigos duplicados, también con otra capitalización, sin dejar cambios', async () => {
    const first = await createSupplier();
    const second = await createSupplier();
    const before = await kit.prisma.supplier.findUniqueOrThrow({ where: { id: second.id } });
    const total = await kit.prisma.supplier.count();

    const duplicate = await kit
      .http()
      .post('/api/suppliers')
      .set('Cookie', cookie)
      .send({ ...newSupplier(), code: first.code.toLowerCase() })
      .expect(409);

    const update = await kit
      .http()
      .patch(`/api/suppliers/${second.id}`)
      .set('Cookie', cookie)
      .send({ code: first.code.toLowerCase() })
      .expect(409);

    expect(await kit.prisma.supplier.count()).toBe(total);
    expect(await kit.prisma.supplier.findUniqueOrThrow({ where: { id: second.id } })).toEqual(
      before,
    );
    expect(await auditFor(duplicate)).toHaveLength(0);
    expect(await auditFor(update)).toHaveLength(0);
  });

  it('rechaza edición vacía, null en campos obligatorios y estados no booleanos', async () => {
    const supplier = await createSupplier();
    const before = await kit.prisma.supplier.findUniqueOrThrow({ where: { id: supplier.id } });

    for (const payload of [{}, { code: null }, { name: null }, { isActive: false }]) {
      await kit
        .http()
        .patch(`/api/suppliers/${supplier.id}`)
        .set('Cookie', cookie)
        .send(payload)
        .expect(400);
    }

    for (const isActive of ['false', 'true', 0, 1, null]) {
      await kit
        .http()
        .patch(`/api/suppliers/${supplier.id}/status`)
        .set('Cookie', cookie)
        .send({ isActive })
        .expect(400);
    }

    expect(await kit.prisma.supplier.findUniqueOrThrow({ where: { id: supplier.id } })).toEqual(
      before,
    );
  });

  it('devuelve 400 para UUID y paginación inválidos, y 404 para un proveedor inexistente', async () => {
    await kit.http().get('/api/suppliers/no-es-uuid').set('Cookie', cookie).expect(400);
    await kit
      .http()
      .patch('/api/suppliers/no-es-uuid')
      .set('Cookie', cookie)
      .send({ name: 'Cambio' })
      .expect(400);
    await kit.http().get('/api/suppliers?limit=101').set('Cookie', cookie).expect(400);

    const id = randomUUID();

    await kit.http().get(`/api/suppliers/${id}`).set('Cookie', cookie).expect(404);
    await kit
      .http()
      .patch(`/api/suppliers/${id}`)
      .set('Cookie', cookie)
      .send({ name: 'Inexistente' })
      .expect(404);
    await kit
      .http()
      .patch(`/api/suppliers/${id}/status`)
      .set('Cookie', cookie)
      .send({ isActive: false })
      .expect(404);
  });

  it('exige sesión en los cinco endpoints', async () => {
    const id = randomUUID();

    await kit.http().get('/api/suppliers').expect(401);
    await kit.http().get(`/api/suppliers/${id}`).expect(401);
    await kit.http().post('/api/suppliers').send(newSupplier()).expect(401);
    await kit.http().patch(`/api/suppliers/${id}`).send({ name: 'Cambio' }).expect(401);
    await kit.http().patch(`/api/suppliers/${id}/status`).send({ isActive: false }).expect(401);
  });

  it.each([RoleCode.INVENTARIO, RoleCode.PRODUCCION, RoleCode.VENTAS])(
    '%s puede consultar, pero no crear, editar ni cambiar el estado',
    async (role) => {
      const readerCookie = await login(kit, await createUser(kit, role));
      const supplier = await createSupplier();
      const before = await kit.prisma.supplier.findUniqueOrThrow({ where: { id: supplier.id } });
      const payload = newSupplier();

      await kit.http().get('/api/suppliers').set('Cookie', readerCookie).expect(200);
      await kit.http().get(`/api/suppliers/${supplier.id}`).set('Cookie', readerCookie).expect(200);
      await kit.http().post('/api/suppliers').set('Cookie', readerCookie).send(payload).expect(403);
      await kit
        .http()
        .patch(`/api/suppliers/${supplier.id}`)
        .set('Cookie', readerCookie)
        .send({ name: 'Cambio prohibido' })
        .expect(403);
      await kit
        .http()
        .patch(`/api/suppliers/${supplier.id}/status`)
        .set('Cookie', readerCookie)
        .send({ isActive: false })
        .expect(403);

      expect(await kit.prisma.supplier.findUnique({ where: { code: payload.code } })).toBeNull();
      expect(await kit.prisma.supplier.findUniqueOrThrow({ where: { id: supplier.id } })).toEqual(
        before,
      );
    },
  );

  it('ADMIN también puede crear, editar y desactivar', async () => {
    const adminCookie = await login(kit, await createUser(kit, RoleCode.ADMIN));
    const response = await kit
      .http()
      .post('/api/suppliers')
      .set('Cookie', adminCookie)
      .send(newSupplier())
      .expect(201);
    const { id } = supplierData(response);

    await kit
      .http()
      .patch(`/api/suppliers/${id}`)
      .set('Cookie', adminCookie)
      .send({ name: 'Modificado por ADMIN' })
      .expect(200);
    await kit
      .http()
      .patch(`/api/suppliers/${id}/status`)
      .set('Cookie', adminCookie)
      .send({ isActive: false })
      .expect(200);

    expect(await kit.prisma.supplier.findUniqueOrThrow({ where: { id } })).toMatchObject({
      name: 'Modificado por ADMIN',
      isActive: false,
    });
  });

  it('serializa altas y cambios de estado concurrentes', async () => {
    const payload = newSupplier();
    const created = await Promise.all(
      [1, 2, 3].map(() => kit.http().post('/api/suppliers').set('Cookie', cookie).send(payload)),
    );
    expect(created.map((response) => response.status).sort()).toEqual([201, 409, 409]);

    const { id } = supplierData(created.find((response) => response.status === 201)!);
    const disabled = await Promise.all(
      [1, 2, 3].map(() =>
        kit
          .http()
          .patch(`/api/suppliers/${id}/status`)
          .set('Cookie', cookie)
          .send({ isActive: false }),
      ),
    );

    expect(disabled.map((response) => response.status).sort()).toEqual([200, 409, 409]);
    expect(
      await kit.prisma.auditLog.count({ where: { entityId: id, action: AuditAction.DISABLE } }),
    ).toBe(1);
  });

  it('revierte creación, edición y ambos cambios de estado si falla la auditoría', async () => {
    const audit = kit.app.get(AuditService);
    const originalRecord = audit.record.bind(audit);

    for (const operation of ['create', 'update', 'disable', 'enable']) {
      const supplier = await createSupplier();
      const payload = newSupplier();

      if (operation === 'enable') {
        await kit
          .http()
          .patch(`/api/suppliers/${supplier.id}/status`)
          .set('Cookie', cookie)
          .send({ isActive: false })
          .expect(200);
      }

      const before = await kit.prisma.supplier.findUniqueOrThrow({ where: { id: supplier.id } });

      // El proveedor y el evento deben revertirse aunque el evento ya se haya insertado.
      vi.spyOn(audit, 'record').mockImplementationOnce(async (writer, event) => {
        await originalRecord(writer, event);
        throw new Error('Fallo simulado de auditoría de proveedores');
      });

      const request =
        operation === 'create'
          ? kit.http().post('/api/suppliers').send(payload)
          : operation === 'update'
            ? kit.http().patch(`/api/suppliers/${supplier.id}`).send({ name: 'No debe persistir' })
            : kit
                .http()
                .patch(`/api/suppliers/${supplier.id}/status`)
                .send({ isActive: operation === 'enable' });

      const response = await request.set('Cookie', cookie).expect(500);

      expect(await auditFor(response)).toHaveLength(0);
      expect(await kit.prisma.supplier.findUniqueOrThrow({ where: { id: supplier.id } })).toEqual(
        before,
      );

      if (operation === 'create') {
        expect(await kit.prisma.supplier.findUnique({ where: { code: payload.code } })).toBeNull();
      }

      vi.restoreAllMocks();
    }
  });
});
