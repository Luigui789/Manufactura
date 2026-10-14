import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuditService } from '../src/audit/audit.service.js';
import { AuditAction, RoleCode } from '../src/generated/prisma/client.js';
import { createInventoryProduct, createInventoryWarehouse } from './support/inventory-fixtures.js';
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

type AdjustmentResponse = {
  data: { id: string };
  message: string;
};

beforeAll(async () => {
  kit = await createTestApp();
  actor = await createUser(kit, RoleCode.INVENTARIO);
  cookie = await login(kit, actor);
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  if (kit) await kit.close();
});

function adjustmentPayload(productId: string, warehouseId: string) {
  return {
    productId,
    warehouseId,
    type: 'ADJUSTMENT_IN',
    quantity: '10.0000',
    reason: 'INITIAL_LOAD',
  };
}

describe('POST /api/inventory/adjustments', () => {
  it('registra el movimiento y la auditoría con el mismo requestId', async () => {
    const product = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);

    const response = await kit
      .http()
      .post('/api/inventory/adjustments')
      .set('Cookie', cookie)
      .send(adjustmentPayload(product.id, warehouse.id))
      .expect(201);

    const body = response.body as AdjustmentResponse;
    expect(body.message).toBe('Ajuste registrado');
    expect(typeof body.data.id).toBe('string');

    const movementId = body.data.id;
    const movement = await kit.prisma.inventoryMovement.findUniqueOrThrow({
      where: { id: movementId },
    });
    const audit = await kit.prisma.auditLog.findFirstOrThrow({
      where: {
        action: AuditAction.ADJUST_STOCK,
        entityId: movementId,
      },
    });

    expect(movement.requestId).toBeTruthy();
    expect(audit.requestId).toBe(movement.requestId);
  });

  it('requiere sesión y restringe la escritura a ADMIN e INVENTARIO', async () => {
    const product = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const payload = adjustmentPayload(product.id, warehouse.id);

    await kit.http().post('/api/inventory/adjustments').send(payload).expect(401);

    const compras = await createUser(kit, RoleCode.COMPRAS);
    const comprasCookie = await login(kit, compras);

    await kit
      .http()
      .post('/api/inventory/adjustments')
      .set('Cookie', comprasCookie)
      .send(payload)
      .expect(403);
  });

  it('rechaza cantidades numéricas, más de 4 decimales y campos extra', async () => {
    const product = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const base = adjustmentPayload(product.id, warehouse.id);

    await kit
      .http()
      .post('/api/inventory/adjustments')
      .set('Cookie', cookie)
      .send({ ...base, quantity: 10 })
      .expect(400);

    await kit
      .http()
      .post('/api/inventory/adjustments')
      .set('Cookie', cookie)
      .send({ ...base, quantity: '1.12345' })
      .expect(400);

    await kit
      .http()
      .post('/api/inventory/adjustments')
      .set('Cookie', cookie)
      .send({ ...base, performedByUserId: actor.id })
      .expect(400);
  });

  it('revierte movimiento, saldo y auditoría si falla AuditLog', async () => {
    const product = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const movementCountBefore = await kit.prisma.inventoryMovement.count({
      where: { productId: product.id, warehouseId: warehouse.id },
    });
    const auditCountBefore = await kit.prisma.auditLog.count({
      where: { action: AuditAction.ADJUST_STOCK, actorUserId: actor.id },
    });

    vi.spyOn(kit.app.get(AuditService), 'record').mockRejectedValueOnce(
      new Error('Fallo simulado de auditoría'),
    );

    await kit
      .http()
      .post('/api/inventory/adjustments')
      .set('Cookie', cookie)
      .send(adjustmentPayload(product.id, warehouse.id))
      .expect(500);

    expect(
      await kit.prisma.inventoryMovement.count({
        where: { productId: product.id, warehouseId: warehouse.id },
      }),
    ).toBe(movementCountBefore);

    expect(
      await kit.prisma.stockBalance.findUnique({
        where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
      }),
    ).toBeNull();

    expect(
      await kit.prisma.auditLog.count({
        where: { action: AuditAction.ADJUST_STOCK, actorUserId: actor.id },
      }),
    ).toBe(auditCountBefore);
  });
});
