import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreatePurchaseOrderDto } from './create-purchase-order.dto.js';
import { ReceivePurchaseOrderDto } from './receive-purchase-order.dto.js';
import { UpdatePurchaseOrderDto } from './update-purchase-order.dto.js';
const id = '00000000-0000-4000-8000-000000000001';
const valid = { supplierId: id, items: [{ productId: id, quantity: '1', unitPrice: '0' }] };
const receipt = { items: [{ purchaseOrderItemId: id, warehouseId: id, quantity: '1' }] };
const errors = (value: unknown) =>
  validate(plainToInstance(CreatePurchaseOrderDto, value, { enableImplicitConversion: true }));
describe('purchase DTO validation', () => {
  it('accepts exact decimal boundaries as text', async () => {
    expect(
      await errors({
        ...valid,
        items: [{ productId: id, quantity: '99999999999999.9999', unitPrice: '9999999999.9999' }],
      }),
    ).toEqual([]);
  });
  it.each([0, 1, null, '0', '00.000', '-1', '1e3', '1.00000', '100000000000000', ' 1'])(
    'rejects quantity %s',
    async (quantity) => {
      expect(
        (await errors({ ...valid, items: [{ ...valid.items[0], quantity }] })).length,
      ).toBeGreaterThan(0);
    },
  );
  it.each([1, null, '-1', '10000000000', '1.00001', '1e2'])(
    'rejects price %s',
    async (unitPrice) => {
      expect(
        (await errors({ ...valid, items: [{ ...valid.items[0], unitPrice }] })).length,
      ).toBeGreaterThan(0);
    },
  );
  it('requires nonempty arrays and rejects null updates', async () => {
    expect((await errors({ ...valid, items: [] })).length).toBeGreaterThan(0);
    expect(
      (await validate(plainToInstance(ReceivePurchaseOrderDto, { items: [] }))).length,
    ).toBeGreaterThan(0);
    for (const value of [{ items: null }, { supplierId: null }])
      expect(
        (await validate(plainToInstance(UpdatePurchaseOrderDto, value))).length,
      ).toBeGreaterThan(0);
    expect(await validate(plainToInstance(UpdatePurchaseOrderDto, { expectedDate: null }))).toEqual(
      [],
    );
  });
  it.each(['2026-02-30', '2026-10-13T12:00:00Z', '2026-1-1', 20261013])(
    'rejects calendar date %s',
    async (expectedDate) => {
      expect((await errors({ ...valid, expectedDate })).length).toBeGreaterThan(0);
      expect(
        (
          await validate(
            plainToInstance(ReceivePurchaseOrderDto, {
              items: [{ ...receipt.items[0], expiresAt: expectedDate }],
            }),
          )
        ).length,
      ).toBeGreaterThan(0);
    },
  );
  it('accepts calendar dates and timestamp with timezone', async () => {
    expect(await errors({ ...valid, expectedDate: '2028-02-29' })).toEqual([]);
    expect(
      await validate(
        plainToInstance(ReceivePurchaseOrderDto, {
          ...receipt,
          receivedAt: '2026-10-13T15:30:00-06:00',
        }),
      ),
    ).toEqual([]);
    expect(
      (
        await validate(
          plainToInstance(ReceivePurchaseOrderDto, { ...receipt, receivedAt: '2026-10-13' }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
