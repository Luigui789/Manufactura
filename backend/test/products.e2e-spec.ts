import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuditService } from '../src/audit/audit.service.js';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  ProductType,
  RoleCode,
  UnitOfMeasure,
  type Product,
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

type ProductJson = Omit<Product, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

function productData(response: { body: unknown }): ProductJson {
  return (response.body as { data: ProductJson }).data;
}

function newProduct() {
  return {
    code: `E2E-${randomUUID()}`.toUpperCase(),
    name: 'Aceite usado recolectado',
    category: 'Aceites',
    type: ProductType.RAW_MATERIAL,
    unit: UnitOfMeasure.LITER,
  };
}

async function createProduct() {
  const response = await kit
    .http()
    .post('/api/products')
    .set('Cookie', cookie)
    .send(newProduct())
    .expect(201);

  return productData(response);
}

function auditFor(response: { headers: Record<string, unknown> }) {
  const requestId = response.headers['x-request-id'];
  expect(requestId).toEqual(expect.any(String));

  return kit.prisma.auditLog.findMany({
    where: { requestId: requestId as string },
  });
}

describe('Productos: API, permisos y auditoría', () => {
  it.each(Object.values(ProductType))(
    'crea un producto %s, normaliza el código y registra CREATE',
    async (type) => {
      const payload = { ...newProduct(), type };

      const response = await kit
        .http()
        .post('/api/products')
        .set('Cookie', cookie)
        .send({
          ...payload,
          code: ` ${payload.code.toLowerCase()} `,
          name: ` ${payload.name} `,
        })
        .expect(201);

      const product = productData(response);

      expect(product).toMatchObject({ ...payload, isActive: true });
      expect(
        await kit.prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      ).toMatchObject({ ...payload, isActive: true });

      const logs = await auditFor(response);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        actorType: ActorType.USER,
        actorUserId: actor.id,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.PRODUCT,
        entityId: product.id,
        previousValues: null,
        newValues: { ...payload, isActive: true },
      });
    },
  );

  it('consulta el detalle y pagina desde el servidor', async () => {
    const product = await createProduct();
    await createProduct();

    const detail = await kit
      .http()
      .get(`/api/products/${product.id}`)
      .set('Cookie', cookie)
      .expect(200);

    expect(productData(detail)).toEqual(product);

    const pages: Array<{
      data: ProductJson[];
      meta: { page: number; limit: number; total: number };
    }> = [];

    const total = await kit.prisma.product.count();

    for (const page of [1, 2]) {
      const response = await kit
        .http()
        .get(`/api/products?page=${page}&limit=1`)
        .set('Cookie', cookie)
        .expect(200);

      const result = response.body as (typeof pages)[number];

      expect(result.meta).toEqual({ page, limit: 1, total });
      expect(result.data).toHaveLength(1);
      pages.push(result);
    }

    expect(pages[0].data[0].id).not.toBe(pages[1].data[0].id);
  });

  it('actualiza los cinco campos, normaliza el código y audita los cambios', async () => {
    const product = await createProduct();

    const changes = {
      code: `EDIT-${randomUUID()}`.toUpperCase(),
      name: 'Aceite filtrado',
      category: 'Semielaborados',
      type: ProductType.INTERMEDIATE,
      unit: UnitOfMeasure.MILLILITER,
    };

    const response = await kit
      .http()
      .patch(`/api/products/${product.id}`)
      .set('Cookie', cookie)
      .send({
        ...changes,
        code: ` ${changes.code.toLowerCase()} `,
      })
      .expect(200);

    expect(productData(response)).toMatchObject({ ...changes, isActive: true });
    expect(await kit.prisma.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject(
      changes,
    );

    const logs = await auditFor(response);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorUserId: actor.id,
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.PRODUCT,
      entityId: product.id,
      previousValues: {
        code: product.code,
        name: product.name,
        category: product.category,
        type: product.type,
        unit: product.unit,
      },
      newValues: changes,
    });
  });

  it('desactiva y reactiva sin borrar; repetir el estado devuelve 409', async () => {
    const product = await createProduct();

    for (const isActive of [false, true]) {
      const response = await kit
        .http()
        .patch(`/api/products/${product.id}/status`)
        .set('Cookie', cookie)
        .send({ isActive })
        .expect(200);

      expect(productData(response).isActive).toBe(isActive);
      expect(
        await kit.prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      ).toMatchObject({ isActive });

      const logs = await auditFor(response);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        actorUserId: actor.id,
        action: isActive ? AuditAction.ENABLE : AuditAction.DISABLE,
        entityType: AuditEntityType.PRODUCT,
        entityId: product.id,
        previousValues: { isActive: !isActive },
        newValues: { isActive },
      });

      const repeated = await kit
        .http()
        .patch(`/api/products/${product.id}/status`)
        .set('Cookie', cookie)
        .send({ isActive })
        .expect(409);

      expect(await auditFor(repeated)).toHaveLength(0);
    }
  });

  it.each([
    { code: ' ' },
    { code: 'X'.repeat(51) },
    { name: ' ' },
    { name: 123 },
    { name: 'X'.repeat(201) },
    { category: null },
    { type: 'DESCONOCIDO' },
    { unit: 'DESCONOCIDA' },
    { isActive: false },
  ])('rechaza un alta inválida: %j', async (invalid) => {
    const total = await kit.prisma.product.count();

    const response = await kit
      .http()
      .post('/api/products')
      .set('Cookie', cookie)
      .send({ ...newProduct(), ...invalid })
      .expect(400);

    expect(await kit.prisma.product.count()).toBe(total);
    expect(await auditFor(response)).toHaveLength(0);
  });

  it('rechaza códigos duplicados con distinta capitalización al crear y editar', async () => {
    const first = await createProduct();
    const second = await createProduct();

    const before = await kit.prisma.product.findUniqueOrThrow({
      where: { id: second.id },
    });
    const total = await kit.prisma.product.count();

    const duplicate = await kit
      .http()
      .post('/api/products')
      .set('Cookie', cookie)
      .send({
        ...newProduct(),
        code: ` ${first.code.toLowerCase()} `,
      })
      .expect(409);

    const update = await kit
      .http()
      .patch(`/api/products/${second.id}`)
      .set('Cookie', cookie)
      .send({
        code: ` ${first.code.toLowerCase()} `,
      })
      .expect(409);

    expect(await kit.prisma.product.count()).toBe(total);
    expect(await kit.prisma.product.findUniqueOrThrow({ where: { id: second.id } })).toEqual(
      before,
    );
    expect(await auditFor(duplicate)).toHaveLength(0);
    expect(await auditFor(update)).toHaveLength(0);
  });

  it('rechaza edición vacía, null y cambios de estado por el endpoint general', async () => {
    const product = await createProduct();
    const before = await kit.prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });

    for (const payload of [{}, { name: null }, { isActive: false }]) {
      await kit
        .http()
        .patch(`/api/products/${product.id}`)
        .set('Cookie', cookie)
        .send(payload)
        .expect(400);
    }

    for (const isActive of ['false', 0, null]) {
      await kit
        .http()
        .patch(`/api/products/${product.id}/status`)
        .set('Cookie', cookie)
        .send({ isActive })
        .expect(400);
    }

    expect(await kit.prisma.product.findUniqueOrThrow({ where: { id: product.id } })).toEqual(
      before,
    );
  });

  it('devuelve 400 para UUID y paginación inválidos, y 404 para un producto inexistente', async () => {
    await kit.http().get('/api/products/no-es-uuid').set('Cookie', cookie).expect(400);
    await kit.http().get('/api/products?limit=101').set('Cookie', cookie).expect(400);

    const id = randomUUID();

    await kit.http().get(`/api/products/${id}`).set('Cookie', cookie).expect(404);

    await kit
      .http()
      .patch(`/api/products/${id}`)
      .set('Cookie', cookie)
      .send({ name: 'Inexistente' })
      .expect(404);

    await kit
      .http()
      .patch(`/api/products/${id}/status`)
      .set('Cookie', cookie)
      .send({ isActive: false })
      .expect(404);
  });

  it('exige sesión en los cinco endpoints', async () => {
    const id = randomUUID();

    await kit.http().get('/api/products').expect(401);
    await kit.http().get(`/api/products/${id}`).expect(401);
    await kit.http().post('/api/products').send(newProduct()).expect(401);
    await kit.http().patch(`/api/products/${id}`).send({ name: 'Cambio' }).expect(401);
    await kit.http().patch(`/api/products/${id}/status`).send({ isActive: false }).expect(401);
  });

  it.each([RoleCode.COMPRAS, RoleCode.PRODUCCION, RoleCode.VENTAS])(
    '%s puede consultar, pero no crear, editar ni cambiar el estado',
    async (role) => {
      const readerCookie = await login(kit, await createUser(kit, role));
      const product = await createProduct();

      const before = await kit.prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      const payload = newProduct();

      await kit.http().get('/api/products').set('Cookie', readerCookie).expect(200);
      await kit.http().get(`/api/products/${product.id}`).set('Cookie', readerCookie).expect(200);
      await kit.http().post('/api/products').set('Cookie', readerCookie).send(payload).expect(403);

      await kit
        .http()
        .patch(`/api/products/${product.id}`)
        .set('Cookie', readerCookie)
        .send({ name: 'Cambio prohibido' })
        .expect(403);

      await kit
        .http()
        .patch(`/api/products/${product.id}/status`)
        .set('Cookie', readerCookie)
        .send({ isActive: false })
        .expect(403);

      expect(await kit.prisma.product.findUnique({ where: { code: payload.code } })).toBeNull();
      expect(await kit.prisma.product.findUniqueOrThrow({ where: { id: product.id } })).toEqual(
        before,
      );
    },
  );

  it('ADMIN también puede crear, editar y desactivar', async () => {
    const adminCookie = await login(kit, await createUser(kit, RoleCode.ADMIN));

    const response = await kit
      .http()
      .post('/api/products')
      .set('Cookie', adminCookie)
      .send(newProduct())
      .expect(201);

    const { id } = productData(response);

    await kit
      .http()
      .patch(`/api/products/${id}`)
      .set('Cookie', adminCookie)
      .send({ name: 'Modificado por ADMIN' })
      .expect(200);

    await kit
      .http()
      .patch(`/api/products/${id}/status`)
      .set('Cookie', adminCookie)
      .send({ isActive: false })
      .expect(200);

    expect(await kit.prisma.product.findUniqueOrThrow({ where: { id } })).toMatchObject({
      name: 'Modificado por ADMIN',
      isActive: false,
    });
  });

  it('revierte creación, edición y ambos cambios de estado si falla la auditoría', async () => {
    const audit = kit.app.get(AuditService);
    const originalRecord = audit.record.bind(audit);

    for (const operation of ['create', 'update', 'disable', 'enable']) {
      const product = await createProduct();
      const payload = newProduct();

      if (operation === 'enable') {
        await kit
          .http()
          .patch(`/api/products/${product.id}/status`)
          .set('Cookie', cookie)
          .send({ isActive: false })
          .expect(200);
      }

      const before = await kit.prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });

      // También debe revertirse el evento si ya se había insertado.
      vi.spyOn(audit, 'record').mockImplementationOnce(async (writer, event) => {
        await originalRecord(writer, event);
        throw new Error('Fallo simulado de auditoría de productos');
      });

      const request =
        operation === 'create'
          ? kit.http().post('/api/products').send(payload)
          : operation === 'update'
            ? kit.http().patch(`/api/products/${product.id}`).send({ name: 'No debe persistir' })
            : kit
                .http()
                .patch(`/api/products/${product.id}/status`)
                .send({ isActive: operation === 'enable' });

      const response = await request.set('Cookie', cookie).expect(500);

      expect(await auditFor(response)).toHaveLength(0);
      expect(await kit.prisma.product.findUniqueOrThrow({ where: { id: product.id } })).toEqual(
        before,
      );

      if (operation === 'create') {
        expect(await kit.prisma.product.findUnique({ where: { code: payload.code } })).toBeNull();
      }

      vi.restoreAllMocks();
    }
  });
});
