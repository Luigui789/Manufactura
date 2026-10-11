import { describe, expect, it } from 'vitest';

import { createProductionOrderSchema } from './order-schemas';

const order = {
  productId: 'a0000000-0000-4000-8000-000000000001',
  bomVersionId: 'b0000000-0000-4000-8000-000000000002',
  warehouseId: 'c0000000-0000-4000-8000-000000000003',
  quantityPlanned: '12.5000',
};

describe('createProductionOrderSchema: referencias', () => {
  it('conserva las referencias y cantidades sin convertirlas', () => {
    expect(createProductionOrderSchema.parse(order)).toEqual(order);
  });

  for (const field of ['productId', 'bomVersionId', 'warehouseId'] as const) {
    it.each(['invalid', '', null, 42, undefined])('rechaza %s en ' + field, (value) => {
      const result = createProductionOrderSchema.safeParse({ ...order, [field]: value });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(expect.objectContaining({ path: [field] }));
      }
    });
  }
});

describe('createProductionOrderSchema: cantidad Decimal(18,4)', () => {
  it.each(['1', '0.0001', '12.5000', '99999999999999', '99999999999999.9999'])(
    'acepta %s y conserva su precisión',
    (quantityPlanned) => {
      expect(createProductionOrderSchema.parse({ ...order, quantityPlanned }).quantityPlanned).toBe(
        quantityPlanned,
      );
    },
  );

  it.each([
    '0',
    '0.0000',
    '000.0000',
    '-1',
    '-0.0001',
    '1.00001',
    '0.00001',
    '100000000000000',
    '99999999999999.99999',
    '',
    ' ',
    '1e3',
    '1,25',
    '.5',
    '1.',
    '+1',
    1,
    0.0001,
    null,
    undefined,
  ])('rechaza %s sin coerción', (quantityPlanned) => {
    expect(createProductionOrderSchema.safeParse({ ...order, quantityPlanned }).success).toBe(
      false,
    );
  });
});

describe('createProductionOrderSchema: fechas locales opcionales', () => {
  it.each([
    {},
    { plannedStartAt: undefined, plannedEndAt: undefined },
    { plannedStartAt: '', plannedEndAt: '' },
    { plannedStartAt: '2026-10-10T08:00' },
    { plannedEndAt: '2026-10-10T12:00' },
    { plannedStartAt: '', plannedEndAt: '2026-10-10T12:00' },
    { plannedStartAt: '2026-10-10T08:00', plannedEndAt: '' },
  ])('permite fechas ausentes o parciales: %j', (dates) => {
    expect(createProductionOrderSchema.parse({ ...order, ...dates })).toEqual({
      ...order,
      ...dates,
    });
  });

  for (const field of ['plannedStartAt', 'plannedEndAt'] as const) {
    it.each(['2024-02-29T23:59', '2000-02-29T00:00', '2026-10-10T08:00', '9999-12-31T23:59'])(
      'acepta una fecha real sin cambiarla: %s en ' + field,
      (value) => {
        expect(createProductionOrderSchema.parse({ ...order, [field]: value })[field]).toBe(value);
      },
    );

    it.each([
      '2026-02-29T08:00',
      '1900-02-29T08:00',
      '2026-04-31T08:00',
      '2026-13-01T08:00',
      '2026-00-01T08:00',
      '2026-10-00T08:00',
      '2026-10-10T24:00',
      '2026-10-10T08:60',
      '0000-01-01T00:00',
      '2026-1-10T08:00',
      '2026-10-1T08:00',
      '2026-10-10T8:00',
      '2026-10-10T08:0',
      '2026-10-10',
      '2026-10-10T08:00:00',
      '2026-10-10T08:00Z',
      '2026-10-10T08:00-06:00',
      ' 2026-10-10T08:00',
      ' ',
      null,
      42,
    ])('rechaza fecha irreal o formato inválido: %s en ' + field, (value) => {
      const result = createProductionOrderSchema.safeParse({ ...order, [field]: value });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(expect.objectContaining({ path: [field] }));
      }
    });
  }

  it.each([
    ['2026-10-10T08:00', '2026-10-10T08:00'],
    ['2026-10-10T08:00', '2026-10-10T08:01'],
    ['2026-10-31T23:59', '2026-11-01T00:00'],
    ['2026-12-31T23:59', '2027-01-01T00:00'],
  ])('permite rango %s → %s', (plannedStartAt, plannedEndAt) => {
    expect(
      createProductionOrderSchema.safeParse({ ...order, plannedStartAt, plannedEndAt }).success,
    ).toBe(true);
  });

  it.each([
    ['2026-10-10T08:01', '2026-10-10T08:00'],
    ['2026-11-01T00:00', '2026-10-31T23:59'],
    ['2027-01-01T00:00', '2026-12-31T23:59'],
  ])('rechaza fin anterior al inicio: %s → %s', (plannedStartAt, plannedEndAt) => {
    const result = createProductionOrderSchema.safeParse({
      ...order,
      plannedStartAt,
      plannedEndAt,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ['plannedEndAt'] }),
      );
    }
  });
});
