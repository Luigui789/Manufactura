import { Prisma } from '../../generated/prisma/client.js';
import { PurchaseOrderErrors } from './purchase-order-errors.js';
export const orderInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  items: { orderBy: { id: 'asc' }, include: { product: true, receiptItems: true } },
  receipts: {
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    include: {
      receivedBy: { select: { fullName: true } },
      items: {
        orderBy: { id: 'asc' },
        include: { warehouse: { select: { id: true, code: true, name: true } }, lot: true },
      },
    },
  },
} satisfies Prisma.PurchaseOrderInclude;
export type OrderDetail = Prisma.PurchaseOrderGetPayload<{ include: typeof orderInclude }>;
export async function readOrder(tx: Pick<Prisma.TransactionClient, 'purchaseOrder'>, id: string) {
  const order = await tx.purchaseOrder.findUnique({ where: { id }, include: orderInclude });
  if (!order) throw PurchaseOrderErrors.referenceNotFound('Orden de compra');
  return order;
}
export async function lockOrder(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM purchase_orders WHERE id = ${id}::uuid FOR UPDATE`;
  if (!rows.length) throw PurchaseOrderErrors.referenceNotFound('Orden de compra');
  return readOrder(tx, id);
}
export function received(item: OrderDetail['items'][number]) {
  return item.receiptItems.reduce((sum, row) => sum.plus(row.quantity), new Prisma.Decimal(0));
}
export function serializeOrder(order: OrderDetail) {
  return {
    id: order.id,
    number: order.number,
    supplier: order.supplier,
    status: order.status,
    orderedAt: order.orderedAt,
    expectedDate: order.expectedDate?.toISOString().slice(0, 10) ?? null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    total: order.items
      .reduce((sum, item) => sum.plus(item.lineTotal), new Prisma.Decimal(0))
      .toFixed(2),
    itemsCount: order.items.length,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productCode: item.product.code,
      productName: item.product.name,
      productUnit: item.product.unit,
      isLotTracked: item.product.isLotTracked,
      requiresQualityInspection: item.product.requiresQualityInspection,
      quantityOrdered: item.quantityOrdered.toFixed(4),
      quantityReceived: received(item).toFixed(4),
      quantityPending: item.quantityOrdered.minus(received(item)).toFixed(4),
      unitPrice: item.unitPrice.toFixed(4),
      lineTotal: item.lineTotal.toFixed(2),
    })),
    receipts: order.receipts.map((receipt) => ({
      id: receipt.id,
      number: receipt.number,
      receivedAt: receipt.receivedAt,
      receivedByFullName: receipt.receivedBy.fullName,
      notes: receipt.notes,
      items: receipt.items.map((item) => ({
        id: item.id,
        purchaseOrderItemId: item.purchaseOrderItemId,
        productId: item.productId,
        warehouse: item.warehouse,
        quantity: item.quantity.toFixed(4),
        lot: item.lot
          ? {
              id: item.lot.id,
              code: item.lot.code,
              status: item.lot.status,
              expiresAt: item.lot.expiresAt?.toISOString().slice(0, 10) ?? null,
            }
          : null,
      })),
    })),
  };
}
