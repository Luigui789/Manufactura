import { describe, expect, it } from 'vitest';
import { purchaseOrderSchema, receiptSchema } from './order-schemas';
const id = '00000000-0000-4000-8000-000000000001';
const valid = {
  supplierId: id,
  expectedDate: '',
  items: [{ productId: id, quantity: '1', unitPrice: '0' }],
};
describe('purchase schemas', () => {
  it('preserves decimal text and exact bounds', () => {
    expect(
      purchaseOrderSchema.parse({
        ...valid,
        items: [{ productId: id, quantity: '99999999999999.9999', unitPrice: '9999999999.9999' }],
      }).items[0].quantity,
    ).toBe('99999999999999.9999');
  });
  it.each(['0', '-1', '1e2', '1.00000', '100000000000000'])('rejects quantity %s', (quantity) => {
    expect(
      purchaseOrderSchema.safeParse({ ...valid, items: [{ ...valid.items[0], quantity }] }).success,
    ).toBe(false);
  });
  it.each(['-1', '1e2', '10000000000', '1.00000'])('rejects price %s', (unitPrice) => {
    expect(
      purchaseOrderSchema.safeParse({ ...valid, items: [{ ...valid.items[0], unitPrice }] })
        .success,
    ).toBe(false);
  });
  it('requires items and real calendar dates', () => {
    expect(purchaseOrderSchema.safeParse({ ...valid, items: [] }).success).toBe(false);
    expect(purchaseOrderSchema.safeParse({ ...valid, expectedDate: '2026-02-30' }).success).toBe(
      false,
    );
    expect(purchaseOrderSchema.safeParse({ ...valid, expectedDate: '2028-02-29' }).success).toBe(
      true,
    );
    expect(
      purchaseOrderSchema.safeParse({ ...valid, expectedDate: '2026-10-13T12:00:00Z' }).success,
    ).toBe(false);
  });
  it('permits split receipt rows and rejects invalid dates, arrays and numbers', () => {
    const row = { purchaseOrderItemId: id, warehouseId: id, quantity: '30', expiresAt: '' };
    const receipt = {
      receivedAt: '2026-10-13T14:00',
      notes: '',
      items: [row, { ...row, quantity: '20' }],
    };
    expect(receiptSchema.safeParse(receipt).success).toBe(true);
    expect(receiptSchema.safeParse({ ...receipt, items: [] }).success).toBe(false);
    expect(receiptSchema.safeParse({ ...receipt, receivedAt: '2026-02-30T14:00' }).success).toBe(
      false,
    );
    expect(receiptSchema.safeParse({ ...receipt, items: [{ ...row, quantity: 1 }] }).success).toBe(
      false,
    );
    expect(
      receiptSchema.safeParse({ ...receipt, items: [{ ...row, expiresAt: '2026-02-30' }] }).success,
    ).toBe(false);
  });
});
