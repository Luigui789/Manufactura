import type { Prisma } from '../generated/prisma/client.js';

export const purchaseOriginSelect = {
  id: true,
  receipt: {
    select: {
      id: true,
      number: true,
      receivedAt: true,
      purchaseOrder: {
        select: {
          id: true,
          number: true,
          supplier: { select: { id: true, code: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.PurchaseReceiptItemSelect;

type ReceiptItem = Prisma.PurchaseReceiptItemGetPayload<{ select: typeof purchaseOriginSelect }>;
export function purchaseOrigin(item: ReceiptItem | null, itemId: string | null) {
  if (!item) {
    if (itemId) throw new Error('Purchase receipt origin relation is missing');
    return null;
  }
  const { purchaseOrder, ...receipt } = item.receipt;
  return {
    type: 'PURCHASE_RECEIPT' as const,
    purchaseReceiptItemId: item.id,
    purchaseReceipt: receipt,
    purchaseOrder: { id: purchaseOrder.id, number: purchaseOrder.number },
    supplier: purchaseOrder.supplier,
  };
}
export function purchaseBusinessReference(item: ReceiptItem | null, itemId: string | null) {
  const origin = purchaseOrigin(item, itemId);
  return origin
    ? {
        type: origin.type,
        id: origin.purchaseReceipt.id,
        number: origin.purchaseReceipt.number,
        purchaseOrder: origin.purchaseOrder,
      }
    : null;
}
