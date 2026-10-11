import { describe, expect, it } from 'vitest';

import { bomVersionSchema, calculationSchema, createBomSchema } from './schemas';

const productId = 'a0000000-0000-4000-8000-000000000001';
const componentId = 'b0000000-0000-4000-8000-000000000002';
const otherComponentId = 'c0000000-0000-4000-8000-000000000003';
const version = {
  outputQuantity: '100',
  items: [{ productId: componentId, quantity: '12.5000' }],
};

describe('createBomSchema', () => {
  it('recorta el nombre y conserva el producto', () => {
    expect(createBomSchema.parse({ productId, name: '  Jabón ecológico  ' })).toEqual({
      productId,
      name: 'Jabón ecológico',
    });
  });

  it.each(['X', 'X'.repeat(120)])('acepta nombre dentro del límite: %s', (name) => {
    expect(createBomSchema.safeParse({ productId, name }).success).toBe(true);
  });

  it.each(['', '   ', 'X'.repeat(121), null, 42])('rechaza nombre inválido: %s', (name) => {
    expect(createBomSchema.safeParse({ productId, name }).success).toBe(false);
  });

  it.each(['not-a-uuid', '', null, 42])('rechaza producto inválido: %s', (id) => {
    expect(createBomSchema.safeParse({ productId: id, name: 'Jabón' }).success).toBe(false);
  });
});

describe('cantidades de Producción como strings Decimal(18,4)', () => {
  const parsers = {
    outputQuantity: (quantity: unknown) =>
      bomVersionSchema.safeParse({ ...version, outputQuantity: quantity }),
    componentQuantity: (quantity: unknown) =>
      bomVersionSchema.safeParse({
        ...version,
        items: [{ productId: componentId, quantity }],
      }),
    quantityPlanned: (quantity: unknown) =>
      calculationSchema.safeParse({ quantityPlanned: quantity }),
  };

  for (const [field, parse] of Object.entries(parsers)) {
    describe(field, () => {
      it.each(['1', '0.0001', '12.5000', '99999999999999', '99999999999999.9999'])(
        'acepta %s',
        (quantity) => {
          expect(parse(quantity).success).toBe(true);
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
        'NaN',
        'Infinity',
        '1e3',
        '0xff',
        '1,25',
        '1.',
        '.5',
        '+1',
        1,
        0.0001,
        null,
      ])('rechaza %s sin coerción', (quantity) => {
        expect(parse(quantity).success).toBe(false);
      });
    });
  }

  it('conserva exactamente las cantidades ingresadas como strings', () => {
    expect(bomVersionSchema.parse(version)).toEqual(version);
    expect(calculationSchema.parse({ quantityPlanned: '99999999999999.9999' })).toEqual({
      quantityPlanned: '99999999999999.9999',
    });
  });
});

describe('bomVersionSchema: componentes', () => {
  it('acepta varios componentes distintos', () => {
    expect(
      bomVersionSchema.safeParse({
        ...version,
        items: [...version.items, { productId: otherComponentId, quantity: '0.0001' }],
      }).success,
    ).toBe(true);
  });

  it('exige al menos un componente', () => {
    expect(bomVersionSchema.safeParse({ ...version, items: [] }).success).toBe(false);
  });

  it.each([componentId, componentId.toUpperCase()])(
    'rechaza duplicados sin distinguir mayúsculas: %s',
    (duplicateId) => {
      const result = bomVersionSchema.safeParse({
        ...version,
        items: [...version.items, { productId: duplicateId, quantity: '1' }],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({ path: ['items', 1, 'productId'] }),
        );
      }
    },
  );

  it.each(['invalid', '', null, 42])('rechaza componente sin UUID válido: %s', (id) => {
    expect(
      bomVersionSchema.safeParse({
        ...version,
        items: [{ productId: id, quantity: '1' }],
      }).success,
    ).toBe(false);
  });
});
