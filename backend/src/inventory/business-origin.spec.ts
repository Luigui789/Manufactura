import { describe, expect, it } from 'vitest';
import { businessOrigin, businessReference } from './business-origin.js';

const purchaseReceiptItem = {
  id: 'item',
  receipt: {
    id: 'receipt',
    number: 'REC-1',
    receivedAt: new Date('2026-10-14T12:00:00Z'),
    purchaseOrder: {
      id: 'purchase',
      number: 'OC-1',
      supplier: { id: 'supplier', code: 'SUP-1', name: 'Proveedor' },
    },
  },
};
const purchase = {
  purchaseReceiptItemId: 'item',
  purchaseReceiptItem,
  productionOrderId: null,
  productionOrder: null,
};
const production = {
  purchaseReceiptItemId: null,
  purchaseReceiptItem: null,
  productionOrderId: 'op',
  productionOrder: { id: 'op', number: 'OP-1', bomVersion: { id: 'bom', version: 2 } },
};
describe('Shared inventory business origins', () => {
  it('preserves the Purchase contract exactly', () => {
    expect(businessOrigin(purchase)).toEqual({
      type: 'PURCHASE_RECEIPT',
      purchaseReceiptItemId: 'item',
      purchaseReceipt: {
        id: 'receipt',
        number: 'REC-1',
        receivedAt: purchaseReceiptItem.receipt.receivedAt,
      },
      purchaseOrder: { id: 'purchase', number: 'OC-1' },
      supplier: { id: 'supplier', code: 'SUP-1', name: 'Proveedor' },
    });
    expect(businessReference(purchase)).toEqual({
      type: 'PURCHASE_RECEIPT',
      id: 'receipt',
      number: 'REC-1',
      purchaseOrder: { id: 'purchase', number: 'OC-1' },
    });
  });
  it('resolves production origins and references', () => {
    expect(businessOrigin(production)).toEqual({
      type: 'PRODUCTION_ORDER',
      productionOrder: { id: 'op', number: 'OP-1' },
      bomVersion: { id: 'bom', version: 2 },
    });
    expect(businessReference(production)).toEqual({
      type: 'PRODUCTION_ORDER',
      id: 'op',
      number: 'OP-1',
    });
  });
  it('allows adjustments without a business reference', () =>
    expect(
      businessReference({
        purchaseReceiptItemId: null,
        purchaseReceiptItem: null,
        productionOrderId: null,
        productionOrder: null,
      }),
    ).toBeNull());
  it.each([
    { ...purchase, purchaseReceiptItem: null },
    { ...production, productionOrder: null },
    {
      ...production,
      ...purchase,
      productionOrderId: 'op',
      productionOrder: production.productionOrder,
    },
  ])('fails on missing or exclusive origin violations', (source) =>
    expect(() => businessOrigin(source)).toThrow(),
  );
});
