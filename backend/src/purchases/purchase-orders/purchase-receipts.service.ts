import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/access-policy.js';
import { currentRequestContext } from '../../common/request-context/request-context.js';
import { DocumentSequenceService } from '../../common/document-sequence/document-sequence.service.js';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  DocumentType,
  InventoryMovementType,
  LotStatus,
  Prisma,
  PurchaseOrderStatus,
} from '../../generated/prisma/client.js';
import {
  InventoryService,
  type MovementLine,
} from '../../inventory/movements/inventory.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto.js';
import { PurchaseOrderErrors } from './purchase-order-errors.js';
import { PurchaseOrderRules } from './purchase-order-rules.js';
import { lockOrder, readOrder, received, serializeOrder } from './purchase-order-mapping.js';

@Injectable()
export class PurchaseReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly sequence: DocumentSequenceService,
    private readonly audit: AuditService,
  ) {}

  async receive(actor: AuthenticatedUser, id: string, dto: ReceivePurchaseOrderDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await lockOrder(tx, id);
        if (!PurchaseOrderRules.canReceive(order.status)) throw PurchaseOrderErrors.notReceivable();
        await tx.$queryRaw`SELECT id FROM suppliers WHERE id = ${order.supplierId}::uuid FOR SHARE`;
        const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: order.supplierId } });
        if (!supplier.isActive) throw PurchaseOrderErrors.inactiveCatalog('Proveedor');
        const byId = new Map(order.items.map((item) => [item.id, item]));
        const requested = new Map<string, Prisma.Decimal>();
        const rows = dto.items.map((row) => {
          const item = byId.get(row.purchaseOrderItemId.toLowerCase());
          if (!item || item.productId !== item.product.id)
            throw PurchaseOrderErrors.referenceNotFound('Línea de esta orden');
          if (!PurchaseOrderRules.isProductTypeAllowed(item.product.type))
            throw new UnprocessableEntityException('Producto no comprable');
          if (row.expiresAt && !item.product.isLotTracked)
            throw new UnprocessableEntityException('El vencimiento requiere producto trazable');
          const quantity = new Prisma.Decimal(row.quantity);
          requested.set(item.id, (requested.get(item.id) ?? new Prisma.Decimal(0)).plus(quantity));
          return { row, item, quantity };
        });
        for (const [itemId, quantity] of requested) {
          const item = byId.get(itemId)!;
          if (PurchaseOrderRules.isOverReceipt(item.quantityOrdered, received(item), quantity))
            throw PurchaseOrderErrors.receiptExceedsPending();
        }
        const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
        const codes = await this.sequence.nextCodes(
          tx,
          [
            DocumentType.PURCHASE_RECEIPT,
            ...rows.filter(({ item }) => item.product.isLotTracked).map(() => DocumentType.LOT),
          ],
          receivedAt,
        );
        const products = await this.inventory.lockPurchaseCatalog(
          tx,
          rows.map(({ item }) => item.productId),
          rows.map(({ row }) => row.warehouseId.toLowerCase()),
        );
        // Revalidate flags after waiting for catalog locks; no new sequence is acquired here.
        const productsById = new Map(products.map((product) => [product.id, product]));
        for (const entry of rows) {
          const product = productsById.get(entry.item.productId)!;
          if (
            product.isLotTracked !== entry.item.product.isLotTracked ||
            product.requiresQualityInspection !== entry.item.product.requiresQualityInspection
          ) {
            throw new UnprocessableEntityException(
              'La configuración del producto cambió; vuelve a intentar la recepción',
            );
          }
        }
        const receipt = await tx.purchaseReceipt.create({
          data: {
            number: codes.get(DocumentType.PURCHASE_RECEIPT)![0],
            purchaseOrderId: id,
            receivedAt,
            receivedByUserId: actor.id,
            notes: dto.notes,
          },
        });
        const lines: MovementLine[] = [];
        let lotIndex = 0;
        // Catalog locks are already held in sorted order before any receipt item FK insert.
        for (const { row, item, quantity } of rows) {
          const receiptItem = await tx.purchaseReceiptItem.create({
            data: {
              purchaseReceiptId: receipt.id,
              purchaseOrderItemId: item.id,
              productId: item.productId,
              warehouseId: row.warehouseId.toLowerCase(),
              quantity,
            },
          });
          lines.push({
            type: InventoryMovementType.PURCHASE_RECEIPT,
            productId: item.productId,
            warehouseId: receiptItem.warehouseId,
            quantity,
            origin: { kind: 'PURCHASE_RECEIPT', purchaseReceiptItemId: receiptItem.id },
            ...(item.product.isLotTracked
              ? {
                  newLot: {
                    code: codes.get(DocumentType.LOT)![lotIndex++],
                    expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
                    status: item.product.requiresQualityInspection
                      ? LotStatus.QUARANTINED
                      : LotStatus.RELEASED,
                    purchaseReceiptItemId: receiptItem.id,
                  },
                }
              : {}),
          });
        }
        await this.inventory.applyMovements(tx, {
          performedByUserId: actor.id,
          occurredAt: receivedAt,
          requestId: currentRequestContext()?.requestId,
          lines,
        });
        const current = await readOrder(tx, id);
        const status = current.items.every((item) => received(item).equals(item.quantityOrdered))
          ? PurchaseOrderStatus.RECEIVED
          : PurchaseOrderStatus.PARTIALLY_RECEIVED;
        await tx.purchaseOrder.update({ where: { id }, data: { status } });
        await this.audit.record(tx, {
          actor: { type: ActorType.USER, userId: actor.id },
          action: AuditAction.RECEIVE,
          entity: { type: AuditEntityType.PURCHASE_RECEIPT, id: receipt.id },
          newValues: {
            number: receipt.number,
            purchaseOrderId: id,
            items: rows.map(({ item, quantity }) => ({
              purchaseOrderItemId: item.id,
              quantity: quantity.toFixed(4),
            })),
          },
        });
        await this.audit.record(tx, {
          actor: { type: ActorType.USER, userId: actor.id },
          action: AuditAction.RECEIVE,
          entity: { type: AuditEntityType.PURCHASE_ORDER, id },
          previousValues: { status: order.status },
          newValues: { status, receiptId: receipt.id },
        });
        return serializeOrder(await readOrder(tx, id));
      },
      { timeout: 15000 },
    );
  }
}
