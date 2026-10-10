import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InventoryService } from '../src/inventory/movements/inventory.service.js';
import { StockQueryService } from '../src/inventory/stock/stock-query.service.js';
import { LotStatus, RoleCode } from '../src/generated/prisma/client.js';
import {
  createInventoryLot,
  createInventoryProduct,
  createInventoryWarehouse,
} from './support/inventory-fixtures.js';
import { createTestApp, createUser, type TestApp } from './support/auth-test-kit.js';

let kit: TestApp;
let actorId: string;
let inventory: InventoryService;
let stockQuery: StockQueryService;

beforeAll(async () => {
  kit = await createTestApp();
  actorId = (await createUser(kit, RoleCode.INVENTARIO)).id;
  inventory = kit.app.get(InventoryService);
  stockQuery = kit.app.get(StockQueryService);
});

afterAll(async () => {
  if (kit) await kit.close();
});

async function addStock(productId: string, warehouseId: string, quantity: string, lotId?: string) {
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

describe('StockQueryService.getAvailableQuantity', () => {
  it('uses the general balance for products without lot tracking', async () => {
    const product = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);

    await addStock(product.id, warehouse.id, '12.5');

    expect((await stockQuery.getAvailableQuantity(product.id, warehouse.id)).toString()).toBe(
      '12.5',
    );
  });

  it('counts only RELEASED lot ledger balances for tracked products', async () => {
    const product = await createInventoryProduct(kit.prisma, { isLotTracked: true });
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const released = await createInventoryLot(kit.prisma, product.id, LotStatus.RELEASED);
    const quarantined = await createInventoryLot(kit.prisma, product.id, LotStatus.QUARANTINED);
    const rejected = await createInventoryLot(kit.prisma, product.id, LotStatus.REJECTED);

    await addStock(product.id, warehouse.id, '8', released.id);
    await addStock(product.id, warehouse.id, '5', quarantined.id);
    await addStock(product.id, warehouse.id, '3', rejected.id);

    expect((await stockQuery.getAvailableQuantity(product.id, warehouse.id)).toString()).toBe('8');
    expect(
      (
        await kit.prisma.stockBalance.findUniqueOrThrow({
          where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
        })
      ).quantity.toString(),
    ).toBe('16');
  });

  it('returns zero when no balance or released lot movements exist', async () => {
    const product = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);

    expect((await stockQuery.getAvailableQuantity(product.id, warehouse.id)).toString()).toBe('0');
  });
});
