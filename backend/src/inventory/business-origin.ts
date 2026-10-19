import type { Prisma } from '../generated/prisma/client.js';
const purchaseOriginSelect = {
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

export const businessOriginSelect = {
  purchaseReceiptItemId: true,
  purchaseReceiptItem: { select: purchaseOriginSelect },
  productionOrderId: true,
  productionOrder: {
    select: { id: true, number: true, bomVersion: { select: { id: true, version: true } } },
  },
} as const;

type BusinessOriginSource = {
  purchaseReceiptItemId: string | null;
  purchaseReceiptItem: Prisma.PurchaseReceiptItemGetPayload<{
    select: typeof purchaseOriginSelect;
  }> | null;
  productionOrderId: string | null;
  productionOrder: {
    id: string;
    number: string;
    bomVersion: { id: string; version: number };
  } | null;
};

/** Shared resolver for lots and movements. Null is valid only when no origin exists. */
export function businessOrigin(source: BusinessOriginSource) {
  if (source.purchaseReceiptItemId && source.productionOrderId)
    throw new Error('Inventory business origin must be exclusive');
  if (
    Boolean(source.purchaseReceiptItemId) !== Boolean(source.purchaseReceiptItem) ||
    Boolean(source.productionOrderId) !== Boolean(source.productionOrder)
  )
    throw new Error('Inventory business origin relation is missing or inconsistent');
  if (source.productionOrder) {
    if (source.productionOrder.id !== source.productionOrderId)
      throw new Error('Production origin FK mismatch');
    const { bomVersion, ...productionOrder } = source.productionOrder;
    return { type: 'PRODUCTION_ORDER' as const, productionOrder, bomVersion };
  }
  if (source.purchaseReceiptItem && source.purchaseReceiptItem.id !== source.purchaseReceiptItemId)
    throw new Error('Purchase origin FK mismatch');
  if (!source.purchaseReceiptItem) return null;
  const { purchaseOrder, ...purchaseReceipt } = source.purchaseReceiptItem.receipt;
  return {
    type: 'PURCHASE_RECEIPT' as const,
    purchaseReceiptItemId: source.purchaseReceiptItem.id,
    purchaseReceipt,
    purchaseOrder: { id: purchaseOrder.id, number: purchaseOrder.number },
    supplier: purchaseOrder.supplier,
  };
}

export function businessReference(source: BusinessOriginSource) {
  const origin = businessOrigin(source);
  if (!origin) return null;
  return origin.type === 'PRODUCTION_ORDER'
    ? { type: origin.type, ...origin.productionOrder }
    : {
        type: origin.type,
        id: origin.purchaseReceipt.id,
        number: origin.purchaseReceipt.number,
        purchaseOrder: origin.purchaseOrder,
      };
}
