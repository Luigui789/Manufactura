import {
  ActorType,
  AuditAction,
  AuditEntityType,
  type AdjustmentReason,
  type InventoryMovementType,
  Prisma,
  type PrismaClient,
} from '../generated/prisma/client.js';

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

/**
 * Único protocolo de escritura de ajustes en Foundation. El futuro servicio de
 * inventario reutilizará este bloqueo y ampliará el origen FK por dominio.
 */
export async function applyAdjustment(prisma: PrismaClient, input: AdjustmentInput) {
  const amount = new Prisma.Decimal(input.quantity);
  if (!amount.isFinite() || !amount.isPositive() || amount.decimalPlaces() > 4) {
    throw new Error('La cantidad del ajuste debe ser positiva y tener hasta 4 decimales');
  }
  if (input.type !== 'ADJUSTMENT_IN' && input.type !== 'ADJUSTMENT_OUT') {
    throw new Error('Foundation solo permite ajustes de inventario');
  }

  return prisma.$transaction(async (tx) => {
    // Una transacción usa una sola conexión: emitir las consultas en secuencia
    // evita solaparlas en el driver PostgreSQL.
    const product = await tx.product.findUnique({ where: { id: input.productId } });
    const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
    const actor = await tx.user.findUnique({ where: { id: input.performedByUserId } });
    if (!product?.isActive || !warehouse?.isActive || !actor?.isActive) {
      throw new Error('Producto, almacén y usuario activos son obligatorios');
    }
    if (product.isLotTracked !== Boolean(input.lotId)) {
      throw new Error('El lote indicado no coincide con la trazabilidad del producto');
    }
    if (input.lotId) {
      const lot = await tx.lot.findUnique({ where: { id: input.lotId } });
      if (!lot || lot.productId !== input.productId) {
        throw new Error('El lote no pertenece al producto del ajuste');
      }
    }

    // ON CONFLICT DO NOTHING permite que dos transacciones creen el primer
    // saldo a la vez; la segunda espera y luego bloquea la fila existente.
    await tx.stockBalance.createMany({
      data: [{ productId: input.productId, warehouseId: input.warehouseId, quantity: 0 }],
      skipDuplicates: true,
    });
    await tx.$queryRaw`SELECT id FROM stock_balances
      WHERE product_id = ${input.productId}::uuid
        AND warehouse_id = ${input.warehouseId}::uuid
      FOR UPDATE`;

    const balance = await tx.stockBalance.findUniqueOrThrow({
      where: {
        productId_warehouseId: {
          productId: input.productId,
          warehouseId: input.warehouseId,
        },
      },
    });
    const signedQuantity = input.type === 'ADJUSTMENT_IN' ? amount : amount.negated();
    if (balance.quantity.plus(signedQuantity).isNegative()) {
      throw new Error('Existencia general insuficiente');
    }
    if (input.lotId && signedQuantity.isNegative()) {
      const lotMovements = await tx.inventoryMovement.aggregate({
        where: { lotId: input.lotId, warehouseId: input.warehouseId },
        _sum: { quantity: true },
      });
      if ((lotMovements._sum.quantity ?? new Prisma.Decimal(0)).plus(signedQuantity).isNegative()) {
        throw new Error('Existencia del lote insuficiente');
      }
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        lotId: input.lotId,
        type: input.type,
        quantity: signedQuantity,
        reason: input.reason,
        performedByUserId: input.performedByUserId,
        requestId: input.requestId,
      },
    });
    await tx.stockBalance.update({
      where: { id: balance.id },
      data: { quantity: { increment: signedQuantity } },
    });
    await tx.auditLog.create({
      data: {
        actorType: ActorType.USER,
        actorUserId: input.performedByUserId,
        action: AuditAction.ADJUST_STOCK,
        entityType: AuditEntityType.INVENTORY_MOVEMENT,
        entityId: movement.id,
        requestId: input.requestId,
        newValues: {
          productId: input.productId,
          warehouseId: input.warehouseId,
          lotId: input.lotId ?? null,
          quantity: signedQuantity.toString(),
          reason: input.reason,
        },
      },
    });
    return movement;
  });
}
