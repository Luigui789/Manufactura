import { ConflictException, Injectable } from '@nestjs/common';
import {
  type InventoryMovement,
  type Lot,
  type Product,
  type Warehouse,
  InventoryMovementType,
  LotStatus,
  ProductType,
  Prisma,
} from '../../generated/prisma/client.js';
import { InventoryErrorCode, inventoryError } from './inventory-errors.js';
import { assertUuid, resolveMovement } from './movement-rules.js';
import type { MovementOrigin } from './movement-origin.js';

export type MovementLine = {
  type: InventoryMovement['type'];
  productId: string;
  warehouseId: string;
  lotId?: string | null;
  newLot?: {
    code: string;
    expiresAt?: Date | null;
    status: LotStatus;
  } & (
    | { purchaseReceiptItemId: string; productionOrderId?: never }
    | { productionOrderId: string; purchaseReceiptItemId?: never }
  );
  quantity: Prisma.Decimal | string;
  origin: MovementOrigin;
};

export type ApplyMovementsCommand = {
  performedByUserId: string;
  occurredAt?: Date;
  requestId?: string | null;
  lines: readonly MovementLine[];
};

export type MovementResourceLine = {
  productId: string;
  warehouseId: string;
  lotId?: string | null;
};

type PreparedMovementResources = {
  productsById: Map<string, Product>;
  warehousesById: Map<string, Warehouse>;
  balancesByKey: Map<string, { quantity: Prisma.Decimal }>;
  lotsById: Map<string, Lot>;
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
  /** Reserve catalog locks before receipt item FK inserts, following ADR 012. */
  async lockPurchaseCatalog(
    tx: Prisma.TransactionClient,
    productIds: string[],
    warehouseIds: string[],
  ) {
    await this.lockCatalogRows(tx, 'products', uniqueSorted(productIds));
    await this.lockCatalogRows(tx, 'warehouses', uniqueSorted(warehouseIds));
    return tx.product.findMany({ where: { id: { in: productIds } } });
  }

  /**
   * Locks the resources referenced by a future movement without writing ledger rows or
   * changing balances. Missing balance rows are created at zero here so callers can
   * safely insert business-origin FKs before applyMovements, without inverting ADR 012.
   */
  async prepareExistingMovementResources(
    tx: Prisma.TransactionClient,
    lines: readonly MovementResourceLine[],
  ): Promise<PreparedMovementResources> {
    if (!lines.length) {
      throw inventoryError(InventoryErrorCode.EMPTY_MOVEMENT, 'Se requiere al menos una línea');
    }
    for (const line of lines) {
      assertUuid(line.productId, 'productId');
      assertUuid(line.warehouseId, 'warehouseId');
      if (line.lotId) assertUuid(line.lotId, 'lotId');
    }

    const productIds = uniqueSorted(lines.map((line) => line.productId));
    const warehouseIds = uniqueSorted(lines.map((line) => line.warehouseId));
    const lotIds = uniqueSorted(lines.flatMap((line) => (line.lotId ? [line.lotId] : [])));
    const balanceKeys = uniqueResourceBalanceKeys(lines);

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
      where: { OR: balanceKeys.map(({ productId, warehouseId }) => ({ productId, warehouseId })) },
    });
    const balancesByKey = new Map(
      balances.map((balance) => [balanceKey(balance.productId, balance.warehouseId), balance]),
    );
    if (balancesByKey.size !== balanceKeys.length) {
      throw inventoryError(
        InventoryErrorCode.REFERENCE_NOT_FOUND,
        'No se pudieron preparar todos los saldos de inventario',
      );
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

    return { productsById, warehousesById, balancesByKey, lotsById };
  }

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

    const productionLines = lines.filter((line) => line.origin.kind === 'PRODUCTION_ORDER');
    const dispatchLines = lines.filter((line) => line.origin.kind === 'SALE_DISPATCH');
    if (dispatchLines.length) {
      const itemIds = dispatchLines.map((line) =>
        line.origin.kind === 'SALE_DISPATCH' ? line.origin.saleDispatchItemId : '',
      );
      if (
        dispatchLines.length !== lines.length ||
        new Set(itemIds).size !== itemIds.length ||
        dispatchLines.some(
          (line) => line.type !== InventoryMovementType.SALE_DISPATCH || line.newLot,
        )
      ) {
        throw inventoryError(
          InventoryErrorCode.INVALID_ORIGIN,
          'El lote de movimientos de despacho no es válido',
        );
      }
    }
    if (productionLines.length) {
      const origins = new Set(
        productionLines.map((line) =>
          line.origin.kind === 'PRODUCTION_ORDER' ? line.origin.productionOrderId : '',
        ),
      );
      if (
        productionLines.length !== lines.length ||
        origins.size !== 1 ||
        productionLines.filter((line) => line.type === InventoryMovementType.PRODUCTION_OUTPUT)
          .length !== 1
      )
        throw inventoryError(
          InventoryErrorCode.INVALID_ORIGIN,
          'La ejecución requiere una sola orden y exactamente un output',
        );
      if (
        await tx.inventoryMovement.findFirst({
          where: {
            productionOrderId: [...origins][0],
            type: InventoryMovementType.PRODUCTION_OUTPUT,
          },
          select: { id: true },
        })
      )
        throw inventoryError(
          InventoryErrorCode.INVALID_ORIGIN,
          'La orden ya tiene un output de producción',
        );
    }

    const balanceKeys = uniqueBalanceKeys(lines);
    const lotBalanceKeys = uniqueLotBalanceKeys(lines);
    const resources = await this.prepareExistingMovementResources(tx, lines);
    const { productsById, balancesByKey, lotsById } = resources;
    for (const productId of uniqueSorted(lines.map((line) => line.productId))) {
      const product = productsById.get(productId)!;
      if (
        lines.some(
          (line) => line.productId === productId && line.origin.kind === 'SALE_DISPATCH',
        ) &&
        product.type !== ProductType.FINISHED_GOOD
      ) {
        throw inventoryError(
          InventoryErrorCode.INVALID_ORIGIN,
          'Solo se pueden despachar productos terminados',
        );
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
      if (product.isLotTracked !== Boolean(line.lotId || line.newLot)) {
        throw inventoryError(
          InventoryErrorCode.LOT_TRACKING_MISMATCH,
          'La presencia de lote debe coincidir con la trazabilidad del producto',
        );
      }
    }
    // Validate business origins after catalog locks and before writing inventory.
    const receiptOrigins = new Set<string>();
    for (const line of lines) {
      if (line.origin.kind === 'PRODUCTION_ORDER') {
        const order = await tx.productionOrder.findUnique({
          where: { id: line.origin.productionOrderId },
          include: { bomVersion: { include: { items: true } } },
        });
        const output = line.type === InventoryMovementType.PRODUCTION_OUTPUT;
        const product = productsById.get(line.productId)!;
        if (
          !order ||
          order.status !== 'IN_PROGRESS' ||
          order.warehouseId !== line.warehouseId ||
          (output
            ? order.productId !== line.productId ||
              line.signedQuantity.gt(order.quantityPlanned) ||
              !line.newLot ||
              line.lotId ||
              !['INTERMEDIATE', 'FINISHED_GOOD'].includes(product.type)
            : !order.bomVersion.items.some((item) => item.componentProductId === line.productId) ||
              Boolean(line.newLot))
        )
          throw inventoryError(
            InventoryErrorCode.INVALID_ORIGIN,
            'El movimiento no coincide con la orden de producción',
          );
        if (
          line.newLot &&
          (line.newLot.productionOrderId !== order.id ||
            line.newLot.status !==
              (product.requiresQualityInspection ? LotStatus.QUARANTINED : LotStatus.RELEASED) ||
            !/^LOT-\d{4}-\d{6,}$/.test(line.newLot.code) ||
            (line.newLot.expiresAt && Number.isNaN(line.newLot.expiresAt.getTime())))
        )
          throw inventoryError(
            InventoryErrorCode.INVALID_ORIGIN,
            'Descripción de lote producido inválida',
          );
        continue;
      }
      if (line.origin.kind !== 'PURCHASE_RECEIPT') {
        if (line.newLot)
          throw inventoryError(InventoryErrorCode.INVALID_ORIGIN, 'Un ajuste no puede crear lotes');
        continue;
      }
      const originId = line.origin.purchaseReceiptItemId;
      if (receiptOrigins.has(originId) || line.lotId) {
        throw inventoryError(
          InventoryErrorCode.INVALID_ORIGIN,
          'Una recepción requiere una entrada por línea y un lote nuevo',
        );
      }
      receiptOrigins.add(originId);
      const item = await tx.purchaseReceiptItem.findUnique({
        where: { id: originId },
        include: { orderItem: true, receipt: { include: { purchaseOrder: true } } },
      });
      const product = productsById.get(line.productId)!;
      if (
        !item ||
        item.productId !== line.productId ||
        item.warehouseId !== line.warehouseId ||
        !item.quantity.equals(line.signedQuantity) ||
        item.orderItem.productId !== item.productId ||
        item.orderItem.purchaseOrderId !== item.receipt.purchaseOrderId ||
        !['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(item.receipt.purchaseOrder.status) ||
        ![ProductType.RAW_MATERIAL, ProductType.CONSUMABLE].includes(
          product.type as 'RAW_MATERIAL' | 'CONSUMABLE',
        )
      ) {
        throw inventoryError(
          InventoryErrorCode.INVALID_ORIGIN,
          'La entrada no coincide con la línea y orden de recepción',
        );
      }
      if (line.newLot) {
        const lot = line.newLot;
        const expectedStatus = product.requiresQualityInspection
          ? LotStatus.QUARANTINED
          : LotStatus.RELEASED;
        if (
          lot.purchaseReceiptItemId !== originId ||
          lot.status !== expectedStatus ||
          !/^LOT-\d{4}-\d{6,}$/.test(lot.code) ||
          (lot.expiresAt && Number.isNaN(lot.expiresAt.getTime()))
        ) {
          throw inventoryError(InventoryErrorCode.INVALID_ORIGIN, 'Descripción de lote inválida');
        }
      }
    }

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
      if (lot.status === LotStatus.SCRAPPED)
        throw new ConflictException('Un lote descartado no admite nuevos movimientos');
      if (
        (line.type === InventoryMovementType.PRODUCTION_CONSUMPTION ||
          line.type === InventoryMovementType.SALE_DISPATCH) &&
        lot.status !== LotStatus.RELEASED
      )
        throw inventoryError(
          InventoryErrorCode.LOT_NOT_RELEASED,
          'Solo se consumen lotes liberados',
        );
    }
    if (dispatchLines.length) {
      const dispatchItems = await tx.saleDispatchItem.findMany({
        where: {
          id: {
            in: dispatchLines.map((line) =>
              line.origin.kind === 'SALE_DISPATCH' ? line.origin.saleDispatchItemId : '',
            ),
          },
        },
        include: { saleDispatch: { include: { saleOrder: { select: { status: true } } } } },
      });
      const itemsById = new Map(dispatchItems.map((item) => [item.id, item]));
      for (const line of dispatchLines) {
        if (line.origin.kind !== 'SALE_DISPATCH') continue;
        const item = itemsById.get(line.origin.saleDispatchItemId);
        if (
          !item ||
          item.productId !== line.productId ||
          item.warehouseId !== line.warehouseId ||
          item.lotId !== line.lotId ||
          !item.quantity.equals(line.signedQuantity.abs()) ||
          !['CONFIRMED', 'PARTIALLY_DISPATCHED'].includes(item.saleDispatch.saleOrder.status)
        ) {
          throw inventoryError(
            InventoryErrorCode.INVALID_ORIGIN,
            'El movimiento no coincide con la línea de despacho',
          );
        }
      }
    }
    // New lots are inserted only after sequences, catalogs, balances and existing lots.
    for (const line of lines) {
      if (!line.newLot) continue;
      const lot = await tx.lot.create({
        data: {
          code: line.newLot.code,
          productId: line.productId,
          status: line.newLot.status,
          originatedAt: occurredAt,
          expiresAt: line.newLot.expiresAt ?? null,
          purchaseReceiptItemId: line.newLot.purchaseReceiptItemId,
          productionOrderId: line.newLot.productionOrderId,
        },
      });
      line.lotId = lot.id;
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
            purchaseReceiptItemId:
              line.origin.kind === 'PURCHASE_RECEIPT' ? line.origin.purchaseReceiptItemId : null,
            productionOrderId:
              line.origin.kind === 'PRODUCTION_ORDER' ? line.origin.productionOrderId : null,
            saleDispatchItemId:
              line.origin.kind === 'SALE_DISPATCH' ? line.origin.saleDispatchItemId : null,
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

  /** Quality follows the same catalog → balance → lot protocol as movements. */
  async inspectProducedLot(
    tx: Prisma.TransactionClient,
    lotId: string,
    status: 'RELEASED' | 'REJECTED',
  ) {
    const before = await tx.lot.findUnique({ where: { id: lotId } });
    if (!before?.productionOrderId)
      throw inventoryError(InventoryErrorCode.INVALID_ORIGIN, 'Calidad requiere un lote producido');
    await this.lockCatalogRows(tx, 'products', [before.productId]);
    const balances = await tx.stockBalance.findMany({
      where: { productId: before.productId },
      orderBy: { warehouseId: 'asc' },
    });
    await this.lockCatalogRows(
      tx,
      'warehouses',
      balances.map((b) => b.warehouseId),
    );
    await this.lockBalances(
      tx,
      balances.map((b) => ({ productId: b.productId, warehouseId: b.warehouseId })),
    );
    await tx.$queryRaw`SELECT id FROM lots WHERE id = ${lotId}::uuid FOR UPDATE`;
    const lot = await tx.lot.findUniqueOrThrow({ where: { id: lotId } });
    if (lot.status !== LotStatus.QUARANTINED)
      throw inventoryError(
        InventoryErrorCode.LOT_NOT_RELEASED,
        'Solo se inspeccionan lotes producidos en cuarentena',
      );
    return tx.lot.update({ where: { id: lotId }, data: { status } });
  }

  /** Caller holds the production-order lock. Exclusive product lock stabilizes the
   * warehouse set before catalog → balances → lot locks, including new-warehouse adjustments.
   * Disposal remains possible for an inactive catalog: it removes physical waste, not usable stock.
   */
  async applyQualityDisposition(
    tx: Prisma.TransactionClient,
    lotId: string,
    type: 'RELEASE' | 'REWORK' | 'SCRAP',
    actorId: string,
    requestId?: string | null,
  ) {
    const origin = await tx.lot.findUniqueOrThrow({ where: { id: lotId } });
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${origin.productId}::uuid FOR UPDATE`;
    const balances = await tx.stockBalance.findMany({
      where: { productId: origin.productId },
      orderBy: { warehouseId: 'asc' },
    });
    await this.lockCatalogRows(
      tx,
      'warehouses',
      balances.map((b) => b.warehouseId),
    );
    await this.lockBalances(
      tx,
      balances.map((b) => ({ productId: b.productId, warehouseId: b.warehouseId })),
    );
    await tx.$queryRaw`SELECT id FROM lots WHERE id = ${lotId}::uuid FOR UPDATE`;
    const lot = await tx.lot.findUniqueOrThrow({ where: { id: lotId } });
    if (!lot.productionOrderId || lot.status !== LotStatus.REJECTED)
      throw new ConflictException('El lote ya no está rechazado o no es producido');
    const scrappedInventory: { warehouseId: string; quantity: string }[] = [];
    if (type === 'SCRAP') {
      const totals = await tx.inventoryMovement.groupBy({
        by: ['warehouseId'],
        where: { lotId },
        _sum: { quantity: true },
        orderBy: { warehouseId: 'asc' },
      });
      for (const total of totals) {
        const quantity = total._sum.quantity ?? new Prisma.Decimal(0);
        if (quantity.isNegative())
          throw new ConflictException('El ledger del lote contiene un saldo negativo');
        if (quantity.isZero()) continue;
        const balance = balances.find((b) => b.warehouseId === total.warehouseId);
        if (!balance || balance.quantity.lt(quantity))
          throw new ConflictException('El saldo general no permite retirar el saldo del lote');
        await tx.inventoryMovement.create({
          data: {
            productId: lot.productId,
            warehouseId: total.warehouseId,
            lotId,
            type: InventoryMovementType.QUALITY_SCRAP,
            quantity: quantity.negated(),
            performedByUserId: actorId,
            requestId,
          },
        });
        await tx.stockBalance.update({
          where: { id: balance.id },
          data: { quantity: { decrement: quantity } },
        });
        scrappedInventory.push({ warehouseId: total.warehouseId, quantity: quantity.toFixed(4) });
      }
    }
    const status =
      type === 'RELEASE'
        ? LotStatus.RELEASED
        : type === 'REWORK'
          ? LotStatus.REWORK
          : LotStatus.SCRAPPED;
    await tx.lot.update({ where: { id: lotId }, data: { status } });
    return { status, scrappedInventory };
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

function uniqueResourceBalanceKeys(lines: readonly MovementResourceLine[]): BalanceKey[] {
  const keys = new Map<string, BalanceKey>();
  for (const { productId, warehouseId } of lines)
    keys.set(balanceKey(productId, warehouseId), { productId, warehouseId });
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
