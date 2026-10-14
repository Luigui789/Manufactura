import { describe, expect, it } from 'vitest';

import { Prisma, PurchaseOrderStatus as S } from '../../generated/prisma/client.js';

import { PurchaseOrderRules as R } from './purchase-order-rules.js';

describe('purchase order rules', () => {
  it.each(Object.values(S))('state matrix %s', (status) => {
    expect(R.canEdit(status)).toBe(status === S.DRAFT);

    expect(R.canConfirm(status)).toBe(status === S.DRAFT);

    expect(R.canReceive(status)).toBe(
      [S.CONFIRMED, S.PARTIALLY_RECEIVED].includes(status as 'CONFIRMED' | 'PARTIALLY_RECEIVED'),
    );

    expect(R.canCancel(status, false)).toBe(status === S.DRAFT || status === S.CONFIRMED);

    expect(R.canCancel(status, true)).toBe(status === S.DRAFT);
  });

  it.each([
    ['1', '1.005', '1.01'],
    ['3', '0.335', '1.01'],
    ['0.1', '0.2', '0.02'],
    ['100', '0', '0.00'],
  ])('ROUND_HALF_UP %s × %s', (q, price, total) => {
    expect(R.calculateLineTotal(new Prisma.Decimal(q), new Prisma.Decimal(price)).toFixed(2)).toBe(
      total,
    );
  });

  it('limits purchasable types and rejects combined overreceipt', () => {
    expect(R.isProductTypeAllowed('RAW_MATERIAL')).toBe(true);

    expect(R.isProductTypeAllowed('CONSUMABLE')).toBe(true);

    expect(R.isProductTypeAllowed('INTERMEDIATE')).toBe(false);

    expect(R.isProductTypeAllowed('FINISHED_GOOD')).toBe(false);

    expect(
      R.isOverReceipt(new Prisma.Decimal(100), new Prisma.Decimal(50), new Prisma.Decimal(51)),
    ).toBe(true);

    expect(
      R.isOverReceipt(new Prisma.Decimal(100), new Prisma.Decimal(50), new Prisma.Decimal(50)),
    ).toBe(false);
  });
});
