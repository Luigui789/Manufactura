import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InventoryService } from '../src/inventory/movements/inventory.service.js';
import { LotStatus, RoleCode } from '../src/generated/prisma/client.js';
import {
  createInventoryLot,
  createInventoryProduct,
  createInventoryWarehouse,
} from './support/inventory-fixtures.js';
import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';

let kit: TestApp;
let actorId: string;
let cookie: string;
let inventory: InventoryService;

beforeAll(async () => {
  kit = await createTestApp();
  const user = await createUser(kit, RoleCode.INVENTARIO);
  actorId = user.id;
  cookie = await login(kit, user);
  inventory = kit.app.get(InventoryService);
});

afterAll(async () => {
  if (kit) await kit.close();
});

async function addStock(productId: string, warehouseId: string, lotId: string, quantity: string) {
  return kit.prisma.$transaction((tx) =>
    inventory.applyMovements(tx, {
      performedByUserId: actorId,
      lines: [
        {
          productId,
          warehouseId,
          lotId,
          type: 'ADJUSTMENT_IN',
          quantity,
          origin: { kind: 'ADJUSTMENT', reason: 'INITIAL_LOAD' },
        },
      ],
    }),
  );
}

describe('GET /api/inventory/lots', () => {
  it('pagina, filtra por estado y producto, suma saldos y deja explícito el origen pendiente de Compras', async () => {
    const product = await createInventoryProduct(kit.prisma, { isLotTracked: true });
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const released = await createInventoryLot(kit.prisma, product.id, LotStatus.RELEASED);
    const quarantined = await createInventoryLot(kit.prisma, product.id, LotStatus.QUARANTINED);
    await addStock(product.id, warehouse.id, released.id, '4.25');

    const response = await kit
      .http()
      .get('/api/inventory/lots')
      .set('Cookie', cookie)
      .query({ productId: product.id, status: LotStatus.RELEASED, hasStock: true, limit: 1 })
      .expect(200);
    const listBody = response.body as {
      data: Array<{ id: string; origin: null; quantityOnHand: string; product: { id: string } }>;
      meta: { page: number; limit: number; total: number };
    };
    expect(listBody.meta).toEqual({ page: 1, limit: 1, total: 1 });
    expect(listBody.data[0]).toMatchObject({
      id: released.id,
      origin: null,
      quantityOnHand: '4.2500',
      product: { id: product.id },
    });
    expect(listBody.data[0].id).not.toBe(quarantined.id);
  });

  it('devuelve balances e historial en el detalle y rechaza IDs inválidos', async () => {
    const product = await createInventoryProduct(kit.prisma, { isLotTracked: true });
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const lot = await createInventoryLot(kit.prisma, product.id);
    await addStock(product.id, warehouse.id, lot.id, '2');
    const response = await kit
      .http()
      .get(`/api/inventory/lots/${lot.id}`)
      .set('Cookie', cookie)
      .expect(200);
    const detailBody = response.body as {
      origin: null;
      balances: Array<{ warehouse: { id: string; code: string; name: string }; quantity: string }>;
      movements: unknown[];
    };
    expect(detailBody.origin).toBeNull();
    expect(detailBody.balances).toEqual([
      expect.objectContaining({
        warehouse: { id: warehouse.id, code: warehouse.code, name: warehouse.name },
        quantity: '2.0000',
      }),
    ]);
    expect(detailBody.movements).toHaveLength(1);
    await kit.http().get('/api/inventory/lots/no-es-uuid').set('Cookie', cookie).expect(400);
  });

  it('requiere sesión y valida filtros', async () => {
    await kit.http().get('/api/inventory/lots').expect(401);
    await kit
      .http()
      .get('/api/inventory/lots?productId=no-es-uuid')
      .set('Cookie', cookie)
      .expect(400);
  });
});
