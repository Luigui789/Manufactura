import { Injectable } from '@nestjs/common';

import { type InventoryMovement, Prisma } from '../../generated/prisma/client.js';
import { InventoryErrorCode, inventoryError } from './inventory-errors.js';
import { assertUuid, resolveMovement } from './movement-rules.js';
import type { MovementOrigin } from './movement-origin.js';

export type MovementLine = {
  type: InventoryMovement['type'];
  productId: string;
  warehouseId: string;
  lotId?: string | null;
  quantity: Prisma.Decimal | string;
  origin: MovementOrigin;
};

export type ApplyMovementsCommand = {
  performedByUserId: string;
  occurredAt?: Date;
  requestId?: string | null;
  lines: readonly MovementLine[];
};

type PreparedLine = MovementLine & {
  lotId: string | null;
  signedQuantity: Prisma.Decimal;
  reason: InventoryMovement['reason'];
};

type BalanceKey = { productId: string; warehouseId: string };
type LotBalanceKey = { lotId: string; warehouseId: string };

@Injectable()
export class InventoryService {
  /** Uses the caller's transaction; it never opens or commits one itself. */
  async applyMovements(
    tx: Prisma.TransactionClient,
    command: ApplyMovementsCommand,
  ): Promise<InventoryMovement[]> {
    if (!Array.isArray(command.lines) || command.lines.length === 0) {
      throw inventoryError(InventoryErrorCode.EMPTY_MOVEMENT, 'Se requiere al menos una línea');
    }
    assertUuid(command.performedByUserId, 'performedByUserId');

    const occurredAt = command.occurredAt ?? new Date();
    if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
      throw inventoryError(
        InventoryErrorCode.INVALID_OCCURRED_AT,
        'occurredAt no es una fecha válida',
      );
    }

    const lines = command.lines.map((line: MovementLine): PreparedLine => {
      assertUuid(line.productId, 'productId');
      assertUuid(line.warehouseId, 'warehouseId');
      if (line.lotId !== undefined && line.lotId !== null) assertUuid(line.lotId, 'lotId');

      const resolved = resolveMovement(line.type, line.quantity, line.origin);
      return {
        ...line,
        lotId: line.lotId ?? null,
        signedQuantity: resolved.signedQuantity,
        reason: resolved.reason,
      };
    });

    const productIds = uniqueSorted(lines.map(({ productId }) => productId));
    const warehouseIds = uniqueSorted(lines.map(({ warehouseId }) => warehouseId));
    const lotIds = uniqueSorted(lines.flatMap(({ lotId }) => (lotId ? [lotId] : [])));
    const balanceKeys = uniqueBalanceKeys(lines);
    const lotBalanceKeys = uniqueLotBalanceKeys(lines);

    await this.lockCatalogRows(tx, 'products', productIds);
    const products = await tx.product.findMany({ where: { id: { in: productIds } } });
    const productsById = new Map(products.map((product) => [product.id, product]));
    for (const productId of productIds) {
      const product = productsById.get(productId);
      if (!product) {
        throw inventoryError(InventoryErrorCode.REFERENCE_NOT_FOUND, 'No se encontró un producto');
      }
      if (!product.isActive) {
        throw inventoryError(InventoryErrorCode.INACTIVE_CATALOG, 'El producto está inactivo');
      }
    }

    await this.lockCatalogRows(tx, 'warehouses', warehouseIds);
    const warehouses = await tx.warehouse.findMany({ where: { id: { in: warehouseIds } } });
    const warehousesById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
    for (const warehouseId of warehouseIds) {
      const warehouse = warehousesById.get(warehouseId);
      if (!warehouse) {
        throw inventoryError(InventoryErrorCode.REFERENCE_NOT_FOUND, 'No se encontró un almacén');
      }
      if (!warehouse.isActive) {
        throw inventoryError(InventoryErrorCode.INACTIVE_CATALOG, 'El almacén está inactivo');
      }
    }

    const actor = await tx.user.findUnique({
      where: { id: command.performedByUserId },
      select: { id: true, isActive: true },
    });
    if (!actor) {
      throw inventoryError(
        InventoryErrorCode.REFERENCE_NOT_FOUND,
        'No se encontró el usuario actor',
      );
    }
    if (!actor.isActive) {
      throw inventoryError(InventoryErrorCode.INACTIVE_ACTOR, 'El usuario actor está inactivo');
    }

    for (const line of lines) {
      const product = productsById.get(line.productId)!;
      if (product.isLotTracked !== Boolean(line.lotId)) {
        throw inventoryError(
          InventoryErrorCode.LOT_TRACKING_MISMATCH,
          'La presencia de lote debe coincidir con la trazabilidad del producto',
        );
      }
    }

    // Create missing balances in a stable order, then serialize every affected pair.
    await tx.stockBalance.createMany({
      data: balanceKeys.map(({ productId, warehouseId }) => ({
        productId,
        warehouseId,
        quantity: new Prisma.Decimal(0),
      })),
      skipDuplicates: true,
    });
    await this.lockBalances(tx, balanceKeys);

    const balances = await tx.stockBalance.findMany({
      where: {
        OR: balanceKeys.map(({ productId, warehouseId }) => ({ productId, warehouseId })),
      },
    });
    const balancesByKey = new Map(
      balances.map((balance) => [balanceKey(balance.productId, balance.warehouseId), balance]),
    );
    if (balancesByKey.size !== balanceKeys.length) {
      throw new Error('No se pudo crear o bloquear todos los saldos de inventario');
    }

    await this.lockCatalogRows(tx, 'lots', lotIds);
    const lots = lotIds.length ? await tx.lot.findMany({ where: { id: { in: lotIds } } }) : [];
    const lotsById = new Map(lots.map((lot) => [lot.id, lot]));
    for (const line of lines) {
      if (!line.lotId) continue;
      const lot = lotsById.get(line.lotId);
      if (!lot) {
        throw inventoryError(
          InventoryErrorCode.REFERENCE_NOT_FOUND,
          'No se encontró el lote indicado',
        );
      }
      if (lot.productId !== line.productId) {
        throw inventoryError(
          InventoryErrorCode.LOT_PRODUCT_MISMATCH,
          'El lote no pertenece al producto del movimiento',
        );
      }
    }

    this.assertSufficientStock(lines, balanceKeys, balancesByKey);
    await this.assertSufficientLotStock(tx, lines, lotBalanceKeys);

    const movements: InventoryMovement[] = [];
    for (const line of lines) {
      movements.push(
        await tx.inventoryMovement.create({
          data: {
            productId: line.productId,
            warehouseId: line.warehouseId,
            lotId: line.lotId,
            type: line.type,
            quantity: line.signedQuantity,
            reason: line.reason,
            occurredAt,
            performedByUserId: command.performedByUserId,
            requestId: command.requestId ?? null,
          },
        }),
      );
    }

    for (const key of balanceKeys) {
      const net = sumForBalance(lines, key);
      if (net.isZero()) continue;
      await tx.stockBalance.update({
        where: { productId_warehouseId: key },
        data: { quantity: { increment: net } },
      });
    }

    return movements;
  }

  private async lockCatalogRows(
    tx: Prisma.TransactionClient,
    table: 'products' | 'warehouses' | 'lots',
    ids: readonly string[],
  ): Promise<void> {
    const tableName = { products: 'products', warehouses: 'warehouses', lots: 'lots' }[table];
    for (const id of ids) {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM ${Prisma.raw(tableName)} WHERE id = ${id}::uuid FOR SHARE
      `;
      if (rows.length === 0) {
        throw inventoryError(
          InventoryErrorCode.REFERENCE_NOT_FOUND,
          `No se encontró el registro ${id}`,
        );
      }
    }
  }

  private async lockBalances(tx: Prisma.TransactionClient, keys: readonly BalanceKey[]) {
    for (const { productId, warehouseId } of keys) {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM stock_balances
        WHERE product_id = ${productId}::uuid AND warehouse_id = ${warehouseId}::uuid
        FOR UPDATE
      `;
      if (rows.length === 0) {
        throw new Error('No se pudo bloquear el saldo de inventario');
      }
    }
  }

  private assertSufficientStock(
    lines: readonly PreparedLine[],
    keys: readonly BalanceKey[],
    balances: ReadonlyMap<string, { quantity: Prisma.Decimal }>,
  ): void {
    for (const key of keys) {
      const balance = balances.get(balanceKey(key.productId, key.warehouseId));
      if (!balance) throw new Error('No se encontró el saldo bloqueado');
      if (balance.quantity.plus(sumForBalance(lines, key)).isNegative()) {
        throw inventoryError(
          InventoryErrorCode.INSUFFICIENT_STOCK,
          'Existencia general insuficiente',
        );
      }
    }
  }

  private async assertSufficientLotStock(
    tx: Prisma.TransactionClient,
    lines: readonly PreparedLine[],
    keys: readonly LotBalanceKey[],
  ): Promise<void> {
    for (const key of keys) {
      const net = sumForLotBalance(lines, key);
      const movements = await tx.inventoryMovement.aggregate({
        where: { lotId: key.lotId, warehouseId: key.warehouseId },
        _sum: { quantity: true },
      });
      const current = movements._sum.quantity ?? new Prisma.Decimal(0);
      if (current.plus(net).isNegative()) {
        throw inventoryError(
          InventoryErrorCode.INSUFFICIENT_LOT_STOCK,
          'Existencia insuficiente para el lote indicado',
        );
      }
    }
  }
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function uniqueBalanceKeys(lines: readonly PreparedLine[]): BalanceKey[] {
  const keys = new Map<string, BalanceKey>();
  for (const { productId, warehouseId } of lines) {
    keys.set(balanceKey(productId, warehouseId), { productId, warehouseId });
  }
  return [...keys.values()].sort(
    (a, b) => compareText(a.productId, b.productId) || compareText(a.warehouseId, b.warehouseId),
  );
}

function uniqueLotBalanceKeys(lines: readonly PreparedLine[]): LotBalanceKey[] {
  const keys = new Map<string, LotBalanceKey>();
  for (const { lotId, warehouseId } of lines) {
    if (!lotId) continue;
    const key = `${lotId}:${warehouseId}`;
    keys.set(key, { lotId, warehouseId });
  }
  return [...keys.values()].sort(
    (a, b) => compareText(a.lotId, b.lotId) || compareText(a.warehouseId, b.warehouseId),
  );
}

function balanceKey(productId: string, warehouseId: string): string {
  return `${productId}:${warehouseId}`;
}

function sumForBalance(lines: readonly PreparedLine[], key: BalanceKey): Prisma.Decimal {
  return lines
    .filter((line) => line.productId === key.productId && line.warehouseId === key.warehouseId)
    .reduce((sum, line) => sum.plus(line.signedQuantity), new Prisma.Decimal(0));
}

function sumForLotBalance(lines: readonly PreparedLine[], key: LotBalanceKey): Prisma.Decimal {
  return lines
    .filter((line) => line.lotId === key.lotId && line.warehouseId === key.warehouseId)
    .reduce((sum, line) => sum.plus(line.signedQuantity), new Prisma.Decimal(0));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
