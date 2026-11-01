import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InventoryService } from '../src/inventory/movements/inventory.service.js';
import { RoleCode } from '../src/generated/prisma/client.js';
import { createInventoryProduct, createInventoryWarehouse } from './support/inventory-fixtures.js';
import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';

let kit: TestApp;
let actorId: string;
let inventory: InventoryService;
let cookie: string;

type MovementsResponse = {
  data: unknown[];
  meta: { page: number; limit: number; total: number };
};

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

async function addMovement(productId: string, warehouseId: string, quantity: string) {
  return kit.prisma.$transaction((tx) =>
    inventory.applyMovements(tx, {
      performedByUserId: actorId,
      lines: [
        {
          productId,
          warehouseId,
          type: 'ADJUSTMENT_IN',
          quantity,
          origin: { kind: 'ADJUSTMENT', reason: 'INITIAL_LOAD' },
        },
      ],
    }),
  );
}

describe('GET /api/inventory/movements', () => {
  it('filtra por producto, almacén y tipo; pagina con cantidad decimal en string', async () => {
    const first = await createInventoryProduct(kit.prisma);
    const second = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await addMovement(first.id, warehouse.id, '3.25');
    await addMovement(second.id, warehouse.id, '8');

    const response = await kit
      .http()
      .get(
        `/api/inventory/movements?productId=${first.id}&warehouseId=${warehouse.id}&type=ADJUSTMENT_IN&page=1&limit=1`,
      )
      .set('Cookie', cookie)
      .expect(200);

    const body = response.body as MovementsResponse;
    expect(body.meta).toEqual({ page: 1, limit: 1, total: 1 });
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      type: 'ADJUSTMENT_IN',
      quantity: '3.2500',
      reason: 'INITIAL_LOAD',
      product: { id: first.id },
      warehouse: { id: warehouse.id },
      lot: null,
      performedByUser: { id: actorId },
    });
  });

  it('rechaza filtros inválidos y rangos de fechas invertidos', async () => {
    await kit
      .http()
      .get('/api/inventory/movements?productId=no-es-uuid')
      .set('Cookie', cookie)
      .expect(400);

    await kit
      .http()
      .get('/api/inventory/movements?from=2026-10-02T00:00:00.000Z&to=2026-10-01T00:00:00.000Z')
      .set('Cookie', cookie)
      .expect(400);
  });

  it('requiere una sesión válida', async () => {
    await kit.http().get('/api/inventory/movements').expect(401);
  });
});
