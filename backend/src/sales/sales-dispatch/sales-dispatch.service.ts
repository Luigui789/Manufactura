import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/access-policy.js';
import { AuditService } from '../../audit/audit.service.js';
import { DocumentSequenceService } from '../../common/document-sequence/document-sequence.service.js';
import {
  InventoryService,
  type MovementLine,
} from '../../inventory/movements/inventory.service.js';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  DocumentType,
  InventoryMovementType,
  Prisma,
  SaleOrderStatus,
} from '../../generated/prisma/client.js';
import { InventoryErrorCode, inventoryError } from '../../inventory/movements/inventory-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateSaleDispatchDto } from './dto/create-sale-dispatch.dto.js';

type DispatchRequestLine = CreateSaleDispatchDto['items'][number];

@Injectable()
export class SalesDispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly sequence: DocumentSequenceService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: AuthenticatedUser, saleOrderId: string, dto: CreateSaleDispatchDto) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM sale_orders WHERE id = ${saleOrderId}::uuid FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundException('Orden de venta no encontrada');
      const order = await tx.saleOrder.findUniqueOrThrow({
        where: { id: saleOrderId },
        include: { items: { orderBy: { id: 'asc' } } },
      });
      if (
        order.status !== SaleOrderStatus.CONFIRMED &&
        order.status !== SaleOrderStatus.PARTIALLY_DISPATCHED
      ) {
        throw new ConflictException(
          'Solo se despachan órdenes confirmadas o parcialmente despachadas',
        );
      }

      const orderItems = new Map(order.items.map((item) => [item.id, item]));
      const requested = aggregateLines(dto.items);
      const priorRows = await tx.saleDispatchItem.findMany({
        where: { saleOrderId },
        select: { saleOrderItemId: true, quantity: true },
      });
      const already = sumByOrderItem(priorRows);
      const requestedByOrderItem = new Map<string, Prisma.Decimal>();
      for (const line of requested) {
        const orderItem = orderItems.get(line.saleOrderItemId);
        if (!orderItem) throw new NotFoundException('La línea no pertenece a esta orden de venta');
        requestedByOrderItem.set(
          line.saleOrderItemId,
          (requestedByOrderItem.get(line.saleOrderItemId) ?? new Prisma.Decimal(0)).plus(
            line.quantity,
          ),
        );
      }
      for (const [itemId, quantity] of requestedByOrderItem) {
        const ordered = orderItems.get(itemId)!.quantity;
        const remaining = ordered.minus(already.get(itemId) ?? new Prisma.Decimal(0));
        if (quantity.gt(remaining)) {
          throw new ConflictException(
            'La cantidad despachada supera la cantidad pendiente de la orden',
          );
        }
      }

      // The order row is the business-document lock; sequence precedes InventoryService's
      // product → warehouse → balances → lot locks, as required by ADR 012.
      const now = new Date();
      const number = await this.sequence.nextCode(tx, DocumentType.SALE_DISPATCH, now);
      const dispatch = await tx.saleDispatch.create({
        data: { number, saleOrderId, dispatchedAt: now, createdByUserId: actor.id },
      });
      // SaleDispatchItem foreign keys acquire implicit locks on products, warehouses,
      // and lots. Take the inventory resource locks first, in ADR 012 order, so those
      // FK checks cannot invert the global lock order before InventoryService runs.
      await lockDispatchResources(tx, requested, orderItems);
      await validateLotProducts(tx, requested, orderItems);
      const dispatchItems = await tx.saleDispatchItem.createManyAndReturn({
        data: requested.map((line) => ({
          saleDispatchId: dispatch.id,
          saleOrderId,
          saleOrderItemId: line.saleOrderItemId,
          productId: orderItems.get(line.saleOrderItemId)!.productId,
          warehouseId: line.warehouseId,
          lotId: line.lotId,
          quantity: line.quantity,
        })),
      });
      const movements: MovementLine[] = dispatchItems.map((item) => ({
        type: InventoryMovementType.SALE_DISPATCH,
        productId: item.productId,
        warehouseId: item.warehouseId,
        lotId: item.lotId,
        quantity: item.quantity,
        origin: { kind: 'SALE_DISPATCH', saleDispatchItemId: item.id },
      }));
      await this.inventory.applyMovements(tx, { performedByUserId: actor.id, lines: movements });

      const totals = new Map(already);
      for (const [itemId, quantity] of requestedByOrderItem)
        totals.set(itemId, (totals.get(itemId) ?? new Prisma.Decimal(0)).plus(quantity));
      const complete = order.items.every((item) =>
        (totals.get(item.id) ?? new Prisma.Decimal(0)).gte(item.quantity),
      );
      const afterStatus = complete
        ? SaleOrderStatus.DISPATCHED
        : SaleOrderStatus.PARTIALLY_DISPATCHED;
      await tx.saleOrder.update({ where: { id: saleOrderId }, data: { status: afterStatus } });
      await this.audit.record(tx, {
        actor: { type: ActorType.USER, userId: actor.id },
        action: AuditAction.DISPATCH,
        entity: { type: AuditEntityType.SALE_DISPATCH, id: dispatch.id },
        previousValues: { saleOrderId, status: order.status },
        newValues: {
          number,
          saleOrderId,
          status: afterStatus,
          items: dispatchItems.map((item) => ({
            saleOrderItemId: item.saleOrderItemId,
            productId: item.productId,
            warehouseId: item.warehouseId,
            lotId: item.lotId,
            quantity: item.quantity.toString(),
          })),
        },
      });
      return {
        id: dispatch.id,
        number,
        saleOrderId,
        dispatchedAt: now,
        items: dispatchItems.map((item) => ({ ...item, quantity: item.quantity.toString() })),
        saleOrderStatus: afterStatus,
      };
    });
  }
}

async function validateLotProducts(
  tx: Prisma.TransactionClient,
  lines: ReturnType<typeof aggregateLines>,
  orderItems: ReadonlyMap<string, { productId: string }>,
): Promise<void> {
  const lotIds = [...new Set(lines.flatMap((line) => (line.lotId ? [line.lotId] : [])))];
  if (!lotIds.length) return;

  const lots = await tx.lot.findMany({
    where: { id: { in: lotIds } },
    select: { id: true, productId: true },
  });
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
    if (lot.productId !== orderItems.get(line.saleOrderItemId)!.productId) {
      throw inventoryError(
        InventoryErrorCode.LOT_PRODUCT_MISMATCH,
        'El lote no pertenece al producto de la línea de despacho',
      );
    }
  }
}

async function lockDispatchResources(
  tx: Prisma.TransactionClient,
  lines: ReturnType<typeof aggregateLines>,
  orderItems: ReadonlyMap<string, { productId: string }>,
): Promise<void> {
  const productIds = [
    ...new Set(lines.map((line) => orderItems.get(line.saleOrderItemId)!.productId)),
  ].sort(compareText);
  const warehouseIds = [...new Set(lines.map((line) => line.warehouseId))].sort(compareText);
  const balanceKeys = [
    ...new Map(
      lines.map((line) => {
        const productId = orderItems.get(line.saleOrderItemId)!.productId;
        return [`${productId}:${line.warehouseId}`, { productId, warehouseId: line.warehouseId }];
      }),
    ).values(),
  ].sort(
    (left, right) =>
      compareText(left.productId, right.productId) ||
      compareText(left.warehouseId, right.warehouseId),
  );
  const lotIds = [...new Set(lines.flatMap((line) => (line.lotId ? [line.lotId] : [])))].sort(
    compareText,
  );

  for (const id of productIds) {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${id}::uuid FOR SHARE`;
  }
  for (const id of warehouseIds) {
    await tx.$queryRaw`SELECT id FROM warehouses WHERE id = ${id}::uuid FOR SHARE`;
  }
  for (const { productId, warehouseId } of balanceKeys) {
    // Missing rows are left for InventoryService to create and validate.
    await tx.$queryRaw`SELECT id FROM stock_balances WHERE product_id = ${productId}::uuid AND warehouse_id = ${warehouseId}::uuid FOR UPDATE`;
  }
  for (const id of lotIds) {
    await tx.$queryRaw`SELECT id FROM lots WHERE id = ${id}::uuid FOR SHARE`;
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function aggregateLines(lines: readonly DispatchRequestLine[]) {
  const grouped = new Map<
    string,
    { saleOrderItemId: string; warehouseId: string; lotId: string | null; quantity: Prisma.Decimal }
  >();
  for (const line of lines) {
    const saleOrderItemId = line.saleOrderItemId.toLowerCase();
    const warehouseId = line.warehouseId.toLowerCase();
    const lotId = line.lotId?.toLowerCase() ?? null;
    const key = `${saleOrderItemId}:${warehouseId}:${lotId ?? ''}`;
    const previous = grouped.get(key);
    const quantity = new Prisma.Decimal(line.quantity);
    grouped.set(key, {
      saleOrderItemId,
      warehouseId,
      lotId,
      quantity: (previous?.quantity ?? new Prisma.Decimal(0)).plus(quantity),
    });
  }
  return [...grouped.values()].sort(
    (a, b) =>
      a.saleOrderItemId.localeCompare(b.saleOrderItemId) ||
      a.warehouseId.localeCompare(b.warehouseId) ||
      (a.lotId ?? '').localeCompare(b.lotId ?? ''),
  );
}

function sumByOrderItem(rows: readonly { saleOrderItemId: string; quantity: Prisma.Decimal }[]) {
  const sums = new Map<string, Prisma.Decimal>();
  for (const row of rows)
    sums.set(
      row.saleOrderItemId,
      (sums.get(row.saleOrderItemId) ?? new Prisma.Decimal(0)).plus(row.quantity),
    );
  return sums;
}
