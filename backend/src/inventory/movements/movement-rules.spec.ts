import { describe, expect, it } from 'vitest';

import { AdjustmentReason, InventoryMovementType, Prisma } from '../../generated/prisma/client.js';
import { InventoryDomainException, InventoryErrorCode } from './inventory-errors.js';
import { assertUuid, parsePositiveQuantity, resolveMovement } from './movement-rules.js';

const adjustment = { kind: 'ADJUSTMENT', reason: AdjustmentReason.PHYSICAL_COUNT } as const;

describe('Reglas de movimientos de inventario', () => {
  it('convierte entrada y salida en cantidades con signo correcto', () => {
    expect(
      resolveMovement(
        InventoryMovementType.ADJUSTMENT_IN,
        '12.5000',
        adjustment,
      ).signedQuantity.toString(),
    ).toBe('12.5');
    expect(
      resolveMovement(
        InventoryMovementType.ADJUSTMENT_OUT,
        '12.5000',
        adjustment,
      ).signedQuantity.toString(),
    ).toBe('-12.5');
  });

  it('usa Decimal exacto para cantidades que producen 0.3', () => {
    const total = parsePositiveQuantity('0.1').plus(parsePositiveQuantity('0.2'));
    expect(total.toString()).toBe('0.3');
  });

  it.each(['0', '0.0000', '-1', '100000000000000', '0.00001', '1.00000', '1e3', 'NaN'])(
    'rechaza la cantidad inválida %s con código estable',
    (quantity) => {
      try {
        parsePositiveQuantity(quantity);
        throw new Error('Se esperaba INVALID_QUANTITY');
      } catch (error) {
        expect(error).toBeInstanceOf(InventoryDomainException);
        expect((error as InventoryDomainException).code).toBe(InventoryErrorCode.INVALID_QUANTITY);
      }
    },
  );

  it('acepta el límite máximo representable por Decimal(18,4)', () => {
    expect(parsePositiveQuantity('99999999999999.9999').toString()).toBe('99999999999999.9999');
    expect(parsePositiveQuantity(new Prisma.Decimal('4.25')).toString()).toBe('4.25');
  });

  it('exige origen de ajuste con un motivo reconocido', () => {
    let thrown: unknown;
    try {
      resolveMovement(InventoryMovementType.ADJUSTMENT_IN, '1', {
        kind: 'ADJUSTMENT',
        reason: 'OTHER',
      } as never);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InventoryDomainException);
    expect((thrown as InventoryDomainException).code).toBe(InventoryErrorCode.INVALID_ORIGIN);
  });

  it('rechaza identificadores que no tienen formato UUID', () => {
    let thrown: unknown;
    try {
      assertUuid('not-a-uuid', 'productId');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InventoryDomainException);
    expect((thrown as InventoryDomainException).code).toBe(InventoryErrorCode.INVALID_REFERENCE);
  });
});

it('purchase receipt requires a typed UUID origin and persists a positive entry without reason', () => {
  const origin = {
    kind: 'PURCHASE_RECEIPT',
    purchaseReceiptItemId: '00000000-0000-4000-8000-000000000001',
  } as const;
  const result = resolveMovement('PURCHASE_RECEIPT', '2.5000', origin);
  expect(result.reason).toBeNull();
  expect(result.signedQuantity.toFixed(4)).toBe('2.5000');
  expect(() => resolveMovement('PURCHASE_RECEIPT', '1', adjustment)).toThrow();
  expect(() => resolveMovement('ADJUSTMENT_IN', '1', origin)).toThrow();
  expect(() =>
    resolveMovement('PURCHASE_RECEIPT', '1', { ...origin, purchaseReceiptItemId: 'invalid' }),
  ).toThrow();
});

it('production uses explicit OP origins and opposite signs without adjustment reasons', () => {
  const origin = {
    kind: 'PRODUCTION_ORDER',
    productionOrderId: '00000000-0000-4000-8000-000000000001',
  } as const;
  expect(resolveMovement('PRODUCTION_CONSUMPTION', '2.5000', origin)).toMatchObject({
    reason: null,
  });
  expect(
    resolveMovement('PRODUCTION_CONSUMPTION', '2.5000', origin).signedQuantity.toFixed(4),
  ).toBe('-2.5000');
  expect(resolveMovement('PRODUCTION_OUTPUT', '2.5000', origin).signedQuantity.toFixed(4)).toBe(
    '2.5000',
  );
  expect(() => resolveMovement('PRODUCTION_OUTPUT', '1', adjustment)).toThrow();
  expect(() => resolveMovement('ADJUSTMENT_IN', '1', origin)).toThrow();
});
