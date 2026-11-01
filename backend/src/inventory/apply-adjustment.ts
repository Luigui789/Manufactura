import {
  ActorType,
  AuditAction,
  AuditEntityType,
  type AdjustmentReason,
  type InventoryMovementType,
  type PrismaClient,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { InventoryService } from './movements/inventory.service.js';
import { InventoryDomainException, InventoryErrorCode } from './movements/inventory-errors.js';

export type AdjustmentInput = {
  productId: string;
  warehouseId: string;
  lotId?: string;
  type: InventoryMovementType;
  quantity: string;
  reason: AdjustmentReason;
  performedByUserId: string;
  requestId?: string;
};

/** Mantiene la firma de Foundation y delega la escritura al protocolo compartido. */
export async function applyAdjustment(prisma: PrismaClient, input: AdjustmentInput) {
  return prisma.$transaction(async (tx) => {
    let movement;
    try {
      [movement] = await new InventoryService().applyMovements(tx, {
        performedByUserId: input.performedByUserId,
        requestId: input.requestId,
        lines: [
          {
            productId: input.productId,
            warehouseId: input.warehouseId,
            lotId: input.lotId,
            type: input.type,
            quantity: input.quantity,
            origin: { kind: 'ADJUSTMENT', reason: input.reason },
          },
        ],
      });
    } catch (error) {
      throw toFoundationAdjustmentError(error, input);
    }

    await new AuditService().record(tx, {
      actor: { type: ActorType.USER, userId: input.performedByUserId },
      action: AuditAction.ADJUST_STOCK,
      entity: { type: AuditEntityType.INVENTORY_MOVEMENT, id: movement.id },
      requestId: input.requestId,
      newValues: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        lotId: input.lotId ?? null,
        quantity: movement.quantity.toString(),
        reason: input.reason,
      },
    });
    return movement;
  });
}

function toFoundationAdjustmentError(error: unknown, input: AdjustmentInput): unknown {
  if (!(error instanceof InventoryDomainException)) return error;

  switch (error.code) {
    case InventoryErrorCode.INACTIVE_CATALOG:
    case InventoryErrorCode.INACTIVE_ACTOR:
      return new Error('Producto, almacén y usuario activos son obligatorios');
    case InventoryErrorCode.LOT_TRACKING_MISMATCH:
      return new Error('El lote indicado no coincide con la trazabilidad del producto');
    case InventoryErrorCode.LOT_PRODUCT_MISMATCH:
      return new Error('El lote no pertenece al producto del ajuste');
    case InventoryErrorCode.REFERENCE_NOT_FOUND:
      return input.lotId && error.message.includes(input.lotId)
        ? new Error('El lote no pertenece al producto del ajuste')
        : new Error('Producto, almacén y usuario activos son obligatorios');
    case InventoryErrorCode.INSUFFICIENT_STOCK:
      return new Error('Existencia general insuficiente');
    case InventoryErrorCode.INSUFFICIENT_LOT_STOCK:
      return new Error('Existencia del lote insuficiente');
    case InventoryErrorCode.INVALID_QUANTITY:
      return new Error('La cantidad del ajuste debe ser positiva y tener hasta 4 decimales');
    case InventoryErrorCode.INVALID_MOVEMENT_TYPE:
      return new Error('Foundation solo permite ajustes de inventario');
    default:
      return error;
  }
}
