import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuditAction,
  AuditEntityType,
  ProductType,
  RoleCode,
  UnitOfMeasure,
} from '../src/generated/prisma/client.js';
import { applyAdjustment } from '../src/inventory/apply-adjustment.js';
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

afterAll(async () => {
  if (kit) await kit.close();
});

async function createProduct() {
  const response = await kit
    .http()
    .post('/api/products')
    .set('Cookie', cookie)
    .send({
      code: `HIST-${randomUUID()}`.toUpperCase(),
      name: 'Aceite para probar historial',
      category: 'Aceites',
      type: ProductType.RAW_MATERIAL,
      unit: UnitOfMeasure.LITER,
    })
    .expect(201);

  const { id } = (response.body as { data: { id: string } }).data;
  return kit.prisma.product.findUniqueOrThrow({ where: { id } });
}

async function addHistory(productId: string, emptyStock: boolean) {
  const warehouse = await kit.prisma.warehouse.create({
    data: {
      code: `HIST-${randomUUID()}`.toUpperCase(),
      name: 'Almacén para probar historial',
      location: 'Zona de pruebas',
    },
  });

  await applyAdjustment(kit.prisma, {
    productId,
    warehouseId: warehouse.id,
    type: 'ADJUSTMENT_IN',
    quantity: '5',
    reason: 'INITIAL_LOAD',
    performedByUserId: actor.id,
    requestId: randomUUID(),
  });

  if (emptyStock) {
    await applyAdjustment(kit.prisma, {
      productId,
      warehouseId: warehouse.id,
      type: 'ADJUSTMENT_OUT',
      quantity: '5',
      reason: 'CORRECTION',
      performedByUserId: actor.id,
      requestId: randomUUID(),
    });
  }

  const balance = await kit.prisma.stockBalance.findUniqueOrThrow({
    where: {
      productId_warehouseId: { productId, warehouseId: warehouse.id },
    },
  });

  expect(balance.quantity.toString()).toBe(emptyStock ? '0' : '5');
  expect(await kit.prisma.inventoryMovement.count({ where: { productId } })).toBe(
    emptyStock ? 2 : 1,
  );
}

function auditFor(response: { headers: Record<string, unknown> }) {
  const requestId = response.headers['x-request-id'];
  expect(requestId).toEqual(expect.any(String));
  return kit.prisma.auditLog.findMany({ where: { requestId: requestId as string } });
}

const restrictedChanges = [
  { field: 'unidad', patch: { unit: UnitOfMeasure.KILOGRAM } },
  { field: 'tipo', patch: { type: ProductType.INTERMEDIATE } },
];

describe('Productos: protección de unidad y tipo con historial', () => {
  describe.each([false, true])('con movimientos y saldo en cero=%s', (emptyStock) => {
    it.each(restrictedChanges)(
      'rechaza cambiar $field sin cambios ni auditoría',
      async ({ patch }) => {
        const product = await createProduct();
        await addHistory(product.id, emptyStock);
        const before = await kit.prisma.product.findUniqueOrThrow({
          where: { id: product.id },
        });

        const response = await kit
          .http()
          .patch(`/api/products/${product.id}`)
          .set('Cookie', cookie)
          .send({ ...patch, name: 'Este cambio tampoco debe persistir' })
          .expect(409);

        expect(response.body).toMatchObject({
          statusCode: 409,
          message:
            'No se puede cambiar la unidad ni el tipo de un producto con movimientos de inventario',
        });
        expect(await kit.prisma.product.findUniqueOrThrow({ where: { id: product.id } })).toEqual(
          before,
        );
        expect(await auditFor(response)).toHaveLength(0);
      },
    );
  });

  it.each(restrictedChanges)(
    'permite cambiar $field cuando no hay movimientos',
    async ({ patch }) => {
      const product = await createProduct();
      expect(await kit.prisma.inventoryMovement.count({ where: { productId: product.id } })).toBe(
        0,
      );

      const response = await kit
        .http()
        .patch(`/api/products/${product.id}`)
        .set('Cookie', cookie)
        .send(patch)
        .expect(200);

      expect(response.body).toMatchObject({ data: { id: product.id, ...patch } });
      expect(
        await kit.prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      ).toMatchObject(patch);

      const logs = await auditFor(response);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.PRODUCT,
        entityId: product.id,
        actorUserId: actor.id,
        newValues: patch,
      });
    },
  );

  it('permite editar código, nombre y categoría con historial conservando unidad y tipo', async () => {
    const product = await createProduct();
    await addHistory(product.id, false);
    const changes = {
      code: `EDIT-${randomUUID()}`.toUpperCase(),
      name: 'Aceite con nombre corregido',
      category: 'Categoría corregida',
    };

    const response = await kit
      .http()
      .patch(`/api/products/${product.id}`)
      .set('Cookie', cookie)
      .send({ ...changes, unit: product.unit, type: product.type })
      .expect(200);

    const expected = {
      id: product.id,
      ...changes,
      unit: product.unit,
      type: product.type,
    };

    expect(response.body).toMatchObject({ data: expected });
    expect(await kit.prisma.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject(
      expected,
    );

    const logs = await auditFor(response);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.PRODUCT,
      entityId: product.id,
      actorUserId: actor.id,
    });
    expect(logs[0].previousValues).toEqual({
      code: product.code,
      name: product.name,
      category: product.category,
    });
    expect(logs[0].newValues).toEqual(changes);
  });
});
