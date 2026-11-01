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

type ItemJson = { id: string; isActive: boolean };
type ProductJson = ItemJson & { unit: UnitOfMeasure; type: ProductType };

function itemOf(response: { body: unknown }): ItemJson {
  return (response.body as { data: ItemJson }).data;
}

function productOf(response: { body: unknown }): ProductJson {
  return (response.body as { data: ProductJson }).data;
}

function messageOf(response: { body: unknown }): string {
  return (response.body as { message: string }).message;
}

function auditFor(response: { headers: Record<string, unknown> }) {
  const requestId = response.headers['x-request-id'];
  expect(requestId).toEqual(expect.any(String));

  return kit.prisma.auditLog.findMany({
    where: { requestId: requestId as string },
  });
}

async function createProduct() {
  const response = await kit
    .http()
    .post('/api/products')
    .set('Cookie', cookie)
    .send({
      code: `STK-${randomUUID()}`.toUpperCase(),
      name: 'Producto con existencias',
      category: 'Pruebas',
      type: ProductType.RAW_MATERIAL,
      unit: UnitOfMeasure.LITER,
    })
    .expect(201);

  return productOf(response);
}

async function createWarehouse() {
  const response = await kit
    .http()
    .post('/api/warehouses')
    .set('Cookie', cookie)
    .send({
      code: `STK-${randomUUID()}`.toUpperCase(),
      name: 'Almacén con existencias',
      location: 'Zona de pruebas',
    })
    .expect(201);

  return itemOf(response);
}

// Crea movimientos y saldos reales con el protocolo de ajustes de Foundation.
function adjust(
  productId: string,
  warehouseId: string,
  type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT',
  quantity: string,
) {
  return applyAdjustment(kit.prisma, {
    productId,
    warehouseId,
    type,
    quantity,
    reason: 'INITIAL_LOAD',
    performedByUserId: actor.id,
  });
}

function setProductStatus(id: string, isActive: boolean) {
  return kit.http().patch(`/api/products/${id}/status`).set('Cookie', cookie).send({ isActive });
}

function setWarehouseStatus(id: string, isActive: boolean) {
  return kit.http().patch(`/api/warehouses/${id}/status`).set('Cookie', cookie).send({ isActive });
}

describe('Productos: bloqueos por existencias y movimientos', () => {
  it('rechaza desactivar un producto con saldo distinto de cero y no deja rastro', async () => {
    const product = await createProduct();
    const warehouse = await createWarehouse();
    await adjust(product.id, warehouse.id, 'ADJUSTMENT_IN', '5');

    const response = await setProductStatus(product.id, false).expect(409);

    expect(messageOf(response)).toContain('existencias');
    expect(await kit.prisma.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject(
      { isActive: true },
    );
    expect(await auditFor(response)).toHaveLength(0);
  });

  it('desactiva solo cuando el saldo es cero en todos los almacenes', async () => {
    const product = await createProduct();
    const first = await createWarehouse();
    const second = await createWarehouse();

    await adjust(product.id, first.id, 'ADJUSTMENT_IN', '5');
    await adjust(product.id, second.id, 'ADJUSTMENT_IN', '3');
    await adjust(product.id, first.id, 'ADJUSTMENT_OUT', '5');

    // El primer almacén ya está en cero, pero el segundo conserva existencias.
    const blocked = await setProductStatus(product.id, false).expect(409);
    expect(messageOf(blocked)).toContain('existencias');

    await adjust(product.id, second.id, 'ADJUSTMENT_OUT', '3');

    const response = await setProductStatus(product.id, false).expect(200);
    expect(productOf(response).isActive).toBe(false);

    const logs = await auditFor(response);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorUserId: actor.id,
      action: AuditAction.DISABLE,
      entityType: AuditEntityType.PRODUCT,
      entityId: product.id,
      previousValues: { isActive: true },
      newValues: { isActive: false },
    });
  });

  it('el saldo de otro producto no bloquea la desactivación', async () => {
    const withoutStock = await createProduct();
    const withStock = await createProduct();
    const warehouse = await createWarehouse();
    await adjust(withStock.id, warehouse.id, 'ADJUSTMENT_IN', '2');

    const response = await setProductStatus(withoutStock.id, false).expect(200);

    expect(productOf(response).isActive).toBe(false);
  });

  it('bloquea cambiar unidad o tipo con movimientos, pero permite el resto', async () => {
    const product = await createProduct();
    const warehouse = await createWarehouse();

    // Saldo final en cero, pero el producto ya tiene movimientos registrados.
    await adjust(product.id, warehouse.id, 'ADJUSTMENT_IN', '1');
    await adjust(product.id, warehouse.id, 'ADJUSTMENT_OUT', '1');

    const before = await kit.prisma.product.findUniqueOrThrow({ where: { id: product.id } });

    for (const change of [{ unit: UnitOfMeasure.MILLILITER }, { type: ProductType.INTERMEDIATE }]) {
      const response = await kit
        .http()
        .patch(`/api/products/${product.id}`)
        .set('Cookie', cookie)
        .send(change)
        .expect(409);

      expect(messageOf(response)).toContain('movimientos');
      expect(await auditFor(response)).toHaveLength(0);
    }

    expect(await kit.prisma.product.findUniqueOrThrow({ where: { id: product.id } })).toEqual(
      before,
    );

    // Repetir la misma unidad no es un cambio; nombre y categoría siguen siendo editables.
    await kit
      .http()
      .patch(`/api/products/${product.id}`)
      .set('Cookie', cookie)
      .send({ unit: product.unit, name: 'Nombre nuevo', category: 'Otra categoría' })
      .expect(200);

    expect(await kit.prisma.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject(
      { name: 'Nombre nuevo', category: 'Otra categoría', unit: product.unit },
    );
  });
});

describe('Almacenes: bloqueo por existencias', () => {
  it('rechaza desactivar con saldo distinto de cero y lo permite con saldo cero', async () => {
    const product = await createProduct();
    const warehouse = await createWarehouse();
    await adjust(product.id, warehouse.id, 'ADJUSTMENT_IN', '2');

    const blocked = await setWarehouseStatus(warehouse.id, false).expect(409);

    expect(messageOf(blocked)).toContain('existencias');
    expect(
      await kit.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } }),
    ).toMatchObject({ isActive: true });
    expect(await auditFor(blocked)).toHaveLength(0);

    await adjust(product.id, warehouse.id, 'ADJUSTMENT_OUT', '2');

    const response = await setWarehouseStatus(warehouse.id, false).expect(200);
    expect(itemOf(response).isActive).toBe(false);

    const logs = await auditFor(response);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorUserId: actor.id,
      action: AuditAction.DISABLE,
      entityType: AuditEntityType.WAREHOUSE,
      entityId: warehouse.id,
      previousValues: { isActive: true },
      newValues: { isActive: false },
    });
  });

  it('las existencias en otro almacén no bloquean este', async () => {
    const product = await createProduct();
    const withStock = await createWarehouse();
    const empty = await createWarehouse();
    await adjust(product.id, withStock.id, 'ADJUSTMENT_IN', '4');

    const response = await setWarehouseStatus(empty.id, false).expect(200);

    expect(itemOf(response).isActive).toBe(false);
  });
});
