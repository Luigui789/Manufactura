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
  LotStatus,
  Prisma,
  ProductType,
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
      const resources = await this.inventory.prepareExistingMovementResources(
        tx,
        requested.map((line) => ({
          productId: orderItems.get(line.saleOrderItemId)!.productId,
          warehouseId: line.warehouseId,
          lotId: line.lotId,
        })),
      );
      for (const line of requested) {
        const product = resources.productsById.get(
          orderItems.get(line.saleOrderItemId)!.productId,
        )!;
        if (product.type !== ProductType.FINISHED_GOOD) {
          throw new ConflictException('Solo se pueden despachar productos terminados');
        }
        if (product.isLotTracked !== Boolean(line.lotId)) {
          throw inventoryError(
            InventoryErrorCode.LOT_TRACKING_MISMATCH,
            'La presencia de lote debe coincidir con la trazabilidad del producto',
          );
        }
        if (line.lotId && resources.lotsById.get(line.lotId)!.status !== LotStatus.RELEASED) {
          throw new ConflictException('Solo se pueden despachar lotes liberados');
        }
      }
      const dispatch = await tx.saleDispatch.create({
        data: { number, saleOrderId, dispatchedAt: now, createdByUserId: actor.id },
      });
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
