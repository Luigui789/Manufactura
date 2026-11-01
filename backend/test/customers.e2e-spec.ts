import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuditService } from '../src/audit/audit.service.js';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  RoleCode,
  type Customer,
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
  actor = await createUser(kit, RoleCode.VENTAS);
  cookie = await login(kit, actor);
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  if (kit) await kit.close();
});

type CustomerJson = Omit<Customer, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

function customerData(response: { body: unknown }): CustomerJson {
  return (response.body as { data: CustomerJson }).data;
}

function newCustomer() {
  return {
    code: `CLI-${randomUUID()}`.toUpperCase(),
    name: 'Supermercados del Norte S.A.',
    taxId: 'J0310000000001',
    email: 'compras@supernorte.com.ni',
    phone: '+505 2222-0000',
    address: 'Bello Horizonte, Managua',
  };
}

async function createCustomer() {
  const response = await kit
    .http()
    .post('/api/customers')
    .set('Cookie', cookie)
    .send(newCustomer())
    .expect(201);
  return customerData(response);
}

function auditFor(response: { headers: Record<string, unknown> }) {
  const requestId = response.headers['x-request-id'];
  expect(requestId).toEqual(expect.any(String));
  return kit.prisma.auditLog.findMany({ where: { requestId: requestId as string } });
}

describe('Clientes: API, permisos y auditoría', () => {
  it('crea un cliente normalizado y registra CREATE con la lista permitida', async () => {
    const payload = newCustomer();
    const response = await kit
      .http()
      .post('/api/customers')
      .set('Cookie', cookie)
      .send({
        ...payload,
        code: `  ${payload.code.toLowerCase()}  `,
        name: `  ${payload.name}  `,
        email: '  Compras@SuperNorte.COM.ni ',
      })
      .expect(201);
    const customer = customerData(response);

    expect(response.body).toMatchObject({ message: 'Cliente creado' });
    expect(customer).toMatchObject({ ...payload, isActive: true });

    const logs = await auditFor(response);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorType: ActorType.USER,
      actorUserId: actor.id,
      action: AuditAction.CREATE,
      entityType: AuditEntityType.CUSTOMER,
      entityId: customer.id,
      previousValues: null,
      newValues: { ...payload, isActive: true },
    });
  });

  it('crea un cliente solo con código y nombre; el contacto queda en null', async () => {
    const { code, name } = newCustomer();
    const response = await kit
      .http()
      .post('/api/customers')
      .set('Cookie', cookie)
      .send({ code, name })
      .expect(201);

    expect(customerData(response)).toMatchObject({
      code,
      name,
      taxId: null,
      email: null,
      phone: null,
      address: null,
    });
  });

  it('consulta el detalle y pagina desde el servidor', async () => {
    const customer = await createCustomer();
    await createCustomer();

    const detail = await kit
      .http()
      .get(`/api/customers/${customer.id}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(detail.body).toEqual({ data: customer, message: 'Cliente encontrado' });

    const total = await kit.prisma.customer.count();
    const ids: string[] = [];

    for (const page of [1, 2]) {
      const response = await kit
        .http()
        .get(`/api/customers?page=${page}&limit=1`)
        .set('Cookie', cookie)
        .expect(200);
      const result = response.body as { data: CustomerJson[]; meta: unknown };
      expect(result.meta).toEqual({ page, limit: 1, total });
      expect(result.data).toHaveLength(1);
      ids.push(result.data[0].id);
    }

    expect(ids[0]).not.toBe(ids[1]);
  });

  it('edita solo los campos enviados y audita únicamente lo que cambió', async () => {
    const customer = await createCustomer();
    const response = await kit
      .http()
      .patch(`/api/customers/${customer.id}`)
      .set('Cookie', cookie)
      .send({ phone: '+505 8888-0000', address: null })
      .expect(200);

    expect(customerData(response)).toMatchObject({
      name: customer.name,
      email: customer.email,
      phone: '+505 8888-0000',
      address: null,
    });

    const logs = await auditFor(response);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.CUSTOMER,
      entityId: customer.id,
      previousValues: { phone: customer.phone, address: customer.address },
      newValues: { phone: '+505 8888-0000', address: null },
    });
  });

  it('una edición que conserva los valores no genera UPDATE', async () => {
    const customer = await createCustomer();
    const response = await kit
      .http()
      .patch(`/api/customers/${customer.id}`)
      .set('Cookie', cookie)
      .send({ name: customer.name })
      .expect(200);

    expect(await auditFor(response)).toHaveLength(0);
  });

  it('desactiva y reactiva sin borrar; repetir el estado devuelve 409', async () => {
    const customer = await createCustomer();

    for (const isActive of [false, true]) {
      const response = await kit
        .http()
        .patch(`/api/customers/${customer.id}/status`)
        .set('Cookie', cookie)
        .send({ isActive })
        .expect(200);

      expect(customerData(response).isActive).toBe(isActive);

      const logs = await auditFor(response);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        action: isActive ? AuditAction.ENABLE : AuditAction.DISABLE,
        previousValues: { isActive: !isActive },
        newValues: { isActive },
      });

      const repeated = await kit
        .http()
        .patch(`/api/customers/${customer.id}/status`)
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
    const total = await kit.prisma.customer.count();
    const response = await kit
      .http()
      .post('/api/customers')
      .set('Cookie', cookie)
      .send({ ...newCustomer(), ...invalid })
      .expect(400);

    expect(await kit.prisma.customer.count()).toBe(total);
    expect(await auditFor(response)).toHaveLength(0);
  });

  it('rechaza códigos duplicados, también con otra capitalización, sin dejar cambios', async () => {
    const first = await createCustomer();
    const second = await createCustomer();
    const before = await kit.prisma.customer.findUniqueOrThrow({ where: { id: second.id } });
    const total = await kit.prisma.customer.count();

    const duplicate = await kit
      .http()
      .post('/api/customers')
      .set('Cookie', cookie)
      .send({ ...newCustomer(), code: first.code.toLowerCase() })
      .expect(409);

    const update = await kit
      .http()
      .patch(`/api/customers/${second.id}`)
      .set('Cookie', cookie)
      .send({ code: first.code.toLowerCase() })
      .expect(409);

    expect(await kit.prisma.customer.count()).toBe(total);
    expect(await kit.prisma.customer.findUniqueOrThrow({ where: { id: second.id } })).toEqual(
      before,
    );
    expect(await auditFor(duplicate)).toHaveLength(0);
    expect(await auditFor(update)).toHaveLength(0);
  });

  it('rechaza edición vacía, null en campos obligatorios y estados no booleanos', async () => {
    const customer = await createCustomer();
    const before = await kit.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });

    for (const payload of [{}, { code: null }, { name: null }, { isActive: false }]) {
      await kit
        .http()
        .patch(`/api/customers/${customer.id}`)
        .set('Cookie', cookie)
        .send(payload)
        .expect(400);
    }

    for (const isActive of ['false', 'true', 0, 1, null]) {
      await kit
        .http()
        .patch(`/api/customers/${customer.id}/status`)
        .set('Cookie', cookie)
        .send({ isActive })
        .expect(400);
    }

    expect(await kit.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).toEqual(
      before,
    );
  });

  it('devuelve 400 para UUID y paginación inválidos, y 404 para un cliente inexistente', async () => {
    await kit.http().get('/api/customers/no-es-uuid').set('Cookie', cookie).expect(400);
    await kit
      .http()
      .patch('/api/customers/no-es-uuid')
      .set('Cookie', cookie)
      .send({ name: 'Cambio' })
      .expect(400);
    await kit.http().get('/api/customers?limit=101').set('Cookie', cookie).expect(400);

    const id = randomUUID();

    await kit.http().get(`/api/customers/${id}`).set('Cookie', cookie).expect(404);
    await kit
      .http()
      .patch(`/api/customers/${id}`)
      .set('Cookie', cookie)
      .send({ name: 'Inexistente' })
      .expect(404);
    await kit
      .http()
      .patch(`/api/customers/${id}/status`)
      .set('Cookie', cookie)
      .send({ isActive: false })
      .expect(404);
  });

  it('exige sesión en los cinco endpoints', async () => {
    const id = randomUUID();

    await kit.http().get('/api/customers').expect(401);
    await kit.http().get(`/api/customers/${id}`).expect(401);
    await kit.http().post('/api/customers').send(newCustomer()).expect(401);
    await kit.http().patch(`/api/customers/${id}`).send({ name: 'Cambio' }).expect(401);
    await kit.http().patch(`/api/customers/${id}/status`).send({ isActive: false }).expect(401);
  });

  it.each([RoleCode.INVENTARIO, RoleCode.PRODUCCION, RoleCode.COMPRAS])(
    '%s puede consultar, pero no crear, editar ni cambiar el estado',
    async (role) => {
      const readerCookie = await login(kit, await createUser(kit, role));
      const customer = await createCustomer();
      const before = await kit.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
      const payload = newCustomer();

      await kit.http().get('/api/customers').set('Cookie', readerCookie).expect(200);
      await kit.http().get(`/api/customers/${customer.id}`).set('Cookie', readerCookie).expect(200);
      await kit.http().post('/api/customers').set('Cookie', readerCookie).send(payload).expect(403);
      await kit
        .http()
        .patch(`/api/customers/${customer.id}`)
        .set('Cookie', readerCookie)
        .send({ name: 'Cambio prohibido' })
        .expect(403);
      await kit
        .http()
        .patch(`/api/customers/${customer.id}/status`)
        .set('Cookie', readerCookie)
        .send({ isActive: false })
        .expect(403);

      expect(await kit.prisma.customer.findUnique({ where: { code: payload.code } })).toBeNull();
      expect(await kit.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).toEqual(
        before,
      );
    },
  );

  it('ADMIN también puede crear, editar y desactivar', async () => {
    const adminCookie = await login(kit, await createUser(kit, RoleCode.ADMIN));
    const response = await kit
      .http()
      .post('/api/customers')
      .set('Cookie', adminCookie)
      .send(newCustomer())
      .expect(201);
    const { id } = customerData(response);

    await kit
      .http()
      .patch(`/api/customers/${id}`)
      .set('Cookie', adminCookie)
      .send({ name: 'Modificado por ADMIN' })
      .expect(200);
    await kit
      .http()
      .patch(`/api/customers/${id}/status`)
      .set('Cookie', adminCookie)
      .send({ isActive: false })
      .expect(200);

    expect(await kit.prisma.customer.findUniqueOrThrow({ where: { id } })).toMatchObject({
      name: 'Modificado por ADMIN',
      isActive: false,
    });
  });

  it('serializa altas y cambios de estado concurrentes', async () => {
    const payload = newCustomer();
    const created = await Promise.all(
      [1, 2, 3].map(() => kit.http().post('/api/customers').set('Cookie', cookie).send(payload)),
    );
    expect(created.map((response) => response.status).sort()).toEqual([201, 409, 409]);

    const { id } = customerData(created.find((response) => response.status === 201)!);
    const disabled = await Promise.all(
      [1, 2, 3].map(() =>
        kit
          .http()
          .patch(`/api/customers/${id}/status`)
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
      const customer = await createCustomer();
      const payload = newCustomer();

      if (operation === 'enable') {
        await kit
          .http()
          .patch(`/api/customers/${customer.id}/status`)
          .set('Cookie', cookie)
          .send({ isActive: false })
          .expect(200);
      }

      const before = await kit.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });

      // El cliente y el evento deben revertirse aunque el evento ya se haya insertado.
      vi.spyOn(audit, 'record').mockImplementationOnce(async (writer, event) => {
        await originalRecord(writer, event);
        throw new Error('Fallo simulado de auditoría de clientes');
      });

      const request =
        operation === 'create'
          ? kit.http().post('/api/customers').send(payload)
          : operation === 'update'
            ? kit.http().patch(`/api/customers/${customer.id}`).send({ name: 'No debe persistir' })
            : kit
                .http()
                .patch(`/api/customers/${customer.id}/status`)
                .send({ isActive: operation === 'enable' });

      const response = await request.set('Cookie', cookie).expect(500);

      expect(await auditFor(response)).toHaveLength(0);
      expect(await kit.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).toEqual(
        before,
      );

      if (operation === 'create') {
        expect(await kit.prisma.customer.findUnique({ where: { code: payload.code } })).toBeNull();
      }

      vi.restoreAllMocks();
    }
  });
});
