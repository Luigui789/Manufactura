import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  InventoryDomainException,
  InventoryErrorCode,
} from '../src/inventory/movements/inventory-errors.js';
import { InventoryService } from '../src/inventory/movements/inventory.service.js';
import { LotStatus, Prisma, RoleCode } from '../src/generated/prisma/client.js';
import {
  createInventoryLot,
  createInventoryProduct,
  createInventoryWarehouse,
} from './support/inventory-fixtures.js';
import { createTestApp, createUser, type TestApp } from './support/auth-test-kit.js';

let kit: TestApp;
let actorId: string;
let inventory: InventoryService;

beforeAll(async () => {
  kit = await createTestApp();
  actorId = (await createUser(kit, RoleCode.INVENTARIO)).id;
  inventory = kit.app.get(InventoryService);
});

afterAll(async () => {
  if (kit) await kit.close();
});

function apply(lines: Parameters<InventoryService['applyMovements']>[1]['lines']) {
  return kit.prisma.$transaction((tx) =>
    inventory.applyMovements(tx, {
      performedByUserId: actorId,
      lines,
    }),
  );
}

function adjustment(
  productId: string,
  warehouseId: string,
  type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT',
  quantity: string,
  lotId?: string,
) {
  return {
    productId,
    warehouseId,
    lotId,
    type,
    quantity,
    origin: { kind: 'ADJUSTMENT' as const, reason: 'INITIAL_LOAD' as const },
  };
}

async function stock(productId: string, warehouseId: string): Promise<string> {
  const [balance, ledger] = await Promise.all([
    kit.prisma.stockBalance.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
    }),
    kit.prisma.inventoryMovement.aggregate({
      where: { productId, warehouseId },
      _sum: { quantity: true },
    }),
  ]);
  const balanceQuantity = balance?.quantity ?? new Prisma.Decimal(0);
  const ledgerQuantity = ledger._sum.quantity ?? new Prisma.Decimal(0);
  expect(balanceQuantity.equals(ledgerQuantity)).toBe(true);
  return ledgerQuantity.toString();
}

function expectDomainError(error: unknown, code: InventoryErrorCode): void {
  expect(error).toBeInstanceOf(InventoryDomainException);
  expect((error as InventoryDomainException).code).toBe(code);
}

async function expectDomainRejection(promise: Promise<unknown>, code: InventoryErrorCode) {
  let thrown: unknown;
  try {
    await promise;
  } catch (error) {
    thrown = error;
  }
  expectDomainError(thrown, code);
}

describe('InventoryService.applyMovements', () => {
  it('registra entradas y salidas conservando la igualdad entre saldo y ledger', async () => {
    const product = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);

    const [incoming] = await apply([adjustment(product.id, warehouse.id, 'ADJUSTMENT_IN', '100')]);
    const [outgoing] = await apply([adjustment(product.id, warehouse.id, 'ADJUSTMENT_OUT', '40')]);

    expect(incoming.quantity.toString()).toBe('100');
    expect(outgoing.quantity.toString()).toBe('-40');
    expect(await stock(product.id, warehouse.id)).toBe('60');
  });

  it('aplica varias líneas dentro de una sola llamada y transacción', async () => {
    const firstProduct = await createInventoryProduct(kit.prisma);
    const secondProduct = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);

    const movements = await apply([
      adjustment(firstProduct.id, warehouse.id, 'ADJUSTMENT_IN', '10.25'),
      adjustment(secondProduct.id, warehouse.id, 'ADJUSTMENT_IN', '20.5'),
    ]);

    expect(movements).toHaveLength(2);
    expect(await stock(firstProduct.id, warehouse.id)).toBe('10.25');
    expect(await stock(secondProduct.id, warehouse.id)).toBe('20.5');
  });

  it('serializa la creación concurrente del primer saldo y conserva balance igual al ledger', async () => {
    const product = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);

    await Promise.all([
      apply([adjustment(product.id, warehouse.id, 'ADJUSTMENT_IN', '4')]),
      apply([adjustment(product.id, warehouse.id, 'ADJUSTMENT_IN', '6')]),
    ]);

    expect(
      await kit.prisma.stockBalance.count({
        where: { productId: product.id, warehouseId: warehouse.id },
      }),
    ).toBe(1);
    expect(await stock(product.id, warehouse.id)).toBe('10');
  }, 15000);

  it('rechaza un lote inexistente y no lo crea automáticamente', async () => {
    const product = await createInventoryProduct(kit.prisma, { isLotTracked: true });
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const missingLotId = randomUUID();

    await expectDomainRejection(
      apply([adjustment(product.id, warehouse.id, 'ADJUSTMENT_IN', '2', missingLotId)]),
      InventoryErrorCode.REFERENCE_NOT_FOUND,
    );

    expect(await kit.prisma.lot.count({ where: { id: missingLotId } })).toBe(0);
    expect(await kit.prisma.inventoryMovement.count({ where: { productId: product.id } })).toBe(0);
    expect(await kit.prisma.stockBalance.count({ where: { productId: product.id } })).toBe(0);
  });

  it('rechaza una salida insuficiente sin persistir balance ni movimiento', async () => {
    const product = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);

    await expectDomainRejection(
      apply([adjustment(product.id, warehouse.id, 'ADJUSTMENT_OUT', '1')]),
      InventoryErrorCode.INSUFFICIENT_STOCK,
    );

    expect(
      await kit.prisma.stockBalance.count({
        where: { productId: product.id, warehouseId: warehouse.id },
      }),
    ).toBe(0);
    expect(
      await kit.prisma.inventoryMovement.count({
        where: { productId: product.id, warehouseId: warehouse.id },
      }),
    ).toBe(0);
  });

  it('revierte todas las líneas si una línea deja saldo neto negativo', async () => {
    const firstProduct = await createInventoryProduct(kit.prisma);
    const secondProduct = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);

    await expectDomainRejection(
      apply([
        adjustment(firstProduct.id, warehouse.id, 'ADJUSTMENT_IN', '5'),
        adjustment(secondProduct.id, warehouse.id, 'ADJUSTMENT_OUT', '1'),
      ]),
      InventoryErrorCode.INSUFFICIENT_STOCK,
    );

    expect(
      await kit.prisma.inventoryMovement.count({
        where: {
          productId: { in: [firstProduct.id, secondProduct.id] },
          warehouseId: warehouse.id,
        },
      }),
    ).toBe(0);
    expect(
      await kit.prisma.stockBalance.count({
        where: {
          productId: { in: [firstProduct.id, secondProduct.id] },
          warehouseId: warehouse.id,
        },
      }),
    ).toBe(0);
  });

  it('valida la existencia del lote y permite ajustes de salida de un lote en cuarentena', async () => {
    const product = await createInventoryProduct(kit.prisma, { isLotTracked: true });
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const lot = await createInventoryLot(kit.prisma, product.id, LotStatus.QUARANTINED);

    await apply([adjustment(product.id, warehouse.id, 'ADJUSTMENT_IN', '10', lot.id)]);
    await apply([adjustment(product.id, warehouse.id, 'ADJUSTMENT_OUT', '4', lot.id)]);

    expect(await stock(product.id, warehouse.id)).toBe('6');
    const lotLedger = await kit.prisma.inventoryMovement.aggregate({
      where: { lotId: lot.id, warehouseId: warehouse.id },
      _sum: { quantity: true },
    });
    expect(lotLedger._sum.quantity?.toString()).toBe('6');
  });

  it('rechaza una salida mayor a la existencia de ese lote aunque el saldo general alcance', async () => {
    const product = await createInventoryProduct(kit.prisma, { isLotTracked: true });
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const firstLot = await createInventoryLot(kit.prisma, product.id);
    const secondLot = await createInventoryLot(kit.prisma, product.id);
    await apply([
      adjustment(product.id, warehouse.id, 'ADJUSTMENT_IN', '5', firstLot.id),
      adjustment(product.id, warehouse.id, 'ADJUSTMENT_IN', '5', secondLot.id),
    ]);

    await expectDomainRejection(
      apply([adjustment(product.id, warehouse.id, 'ADJUSTMENT_OUT', '6', firstLot.id)]),
      InventoryErrorCode.INSUFFICIENT_LOT_STOCK,
    );

    expect(await stock(product.id, warehouse.id)).toBe('10');
  });

  it('valida conjuntamente las líneas repetidas del mismo saldo', async () => {
    const product = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);

    await expectDomainRejection(
      apply([
        adjustment(product.id, warehouse.id, 'ADJUSTMENT_IN', '100'),
        adjustment(product.id, warehouse.id, 'ADJUSTMENT_OUT', '60'),
        adjustment(product.id, warehouse.id, 'ADJUSTMENT_OUT', '50'),
      ]),
      InventoryErrorCode.INSUFFICIENT_STOCK,
    );

    expect(await stock(product.id, warehouse.id)).toBe('0');
  });

  it('serializa salidas concurrentes sin permitir saldo negativo', async () => {
    const product = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await apply([adjustment(product.id, warehouse.id, 'ADJUSTMENT_IN', '100')]);

    const results = await Promise.allSettled([
      apply([adjustment(product.id, warehouse.id, 'ADJUSTMENT_OUT', '70')]),
      apply([adjustment(product.id, warehouse.id, 'ADJUSTMENT_OUT', '70')]),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(({ status }) => status === 'rejected');
    if (!rejected || rejected.status !== 'rejected') throw new Error('Faltó rechazar una salida');
    expectDomainError(rejected.reason, InventoryErrorCode.INSUFFICIENT_STOCK);
    expect(await stock(product.id, warehouse.id)).toBe('30');
  });

  it('bloquea varios saldos en orden estable aunque las líneas lleguen invertidas', async () => {
    const first = await createInventoryProduct(kit.prisma);
    const second = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await apply([
      adjustment(first.id, warehouse.id, 'ADJUSTMENT_IN', '10'),
      adjustment(second.id, warehouse.id, 'ADJUSTMENT_IN', '10'),
    ]);

    await Promise.all([
      apply([
        adjustment(first.id, warehouse.id, 'ADJUSTMENT_OUT', '1'),
        adjustment(second.id, warehouse.id, 'ADJUSTMENT_OUT', '1'),
      ]),
      apply([
        adjustment(second.id, warehouse.id, 'ADJUSTMENT_OUT', '1'),
        adjustment(first.id, warehouse.id, 'ADJUSTMENT_OUT', '1'),
      ]),
    ]);

    expect(await stock(first.id, warehouse.id)).toBe('8');
    expect(await stock(second.id, warehouse.id)).toBe('8');
  }, 15000);
});
