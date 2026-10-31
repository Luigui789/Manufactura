import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import {
  activityEmissions,
  CarbonValueError,
  emissionIntensity,
  parseActivityQuantity,
  parseFactorValue,
  totalEmissions,
  totalsByCategory,
} from './carbon-math.js';
import {
  circularityMetrics,
  planAutomaticActivities,
  productFactorViolation,
  type FactorSnapshotSource,
} from './carbon-rules.js';
import {
  areUnitsCompatible,
  convertQuantity,
  dimensionOf,
  IncompatibleUnitsError,
} from './carbon-units.js';
import { CreateEmissionFactorDto } from './emission-factors/emission-factors.dto.js';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

const D = (value: string) => new Prisma.Decimal(value);
const factor = (overrides: Partial<FactorSnapshotSource> = {}): FactorSnapshotSource => ({
  id: 'f',
  code: 'TEST-RAW-001',
  name: 'Factor de prueba',
  category: 'RAW_MATERIAL',
  activityUnit: 'KILOGRAM',
  kgCo2ePerUnit: D('2.10000000'),
  sourceName: 'TEST_FIXTURE',
  sourceReference: 'TEST_FIXTURE',
  sourceYear: null,
  ...overrides,
});

describe('conversión de unidades de actividad', () => {
  it('convierte GRAM ↔ KILOGRAM exactamente', () => {
    expect(convertQuantity('1000', 'GRAM', 'KILOGRAM').toFixed()).toBe('1');
    expect(convertQuantity('700', 'GRAM', 'KILOGRAM').toFixed()).toBe('0.7');
    expect(convertQuantity('0.0001', 'GRAM', 'KILOGRAM').toFixed()).toBe('0.0000001');
    expect(convertQuantity('1.5', 'KILOGRAM', 'GRAM').toFixed()).toBe('1500');
  });

  it('convierte MILLILITER ↔ LITER exactamente', () => {
    expect(convertQuantity('500', 'MILLILITER', 'LITER').toFixed()).toBe('0.5');
    expect(convertQuantity('100000', 'MILLILITER', 'LITER').toFixed()).toBe('100');
    expect(convertQuantity('0.25', 'LITER', 'MILLILITER').toFixed()).toBe('250');
  });

  it('rechaza conversiones entre dimensiones distintas sin densidad', () => {
    for (const [from, to] of [
      ['LITER', 'KILOGRAM'],
      ['MILLILITER', 'GRAM'],
      ['UNIT', 'KILOGRAM'],
      ['KILOGRAM', 'UNIT'],
      ['KWH', 'LITER'],
      ['KILOMETER', 'TON_KILOMETER'],
    ] as const) {
      expect(areUnitsCompatible(from, to)).toBe(false);
      expect(() => convertQuantity('1', from, to)).toThrow(IncompatibleUnitsError);
    }
    expect(dimensionOf('TON_KILOMETER')).toBe('FREIGHT');
  });

  it('no pierde precisión con valores que un float no representa', () => {
    // 0.1 + 0.2 en float es 0.30000000000000004
    expect(totalEmissions(['0.10000000', '0.20000000']).toFixed(8)).toBe('0.30000000');
    expect(convertQuantity('12345678901.2345', 'GRAM', 'KILOGRAM').toFixed()).toBe(
      '12345678.9012345',
    );
  });
});

describe('coeficientes de emisión', () => {
  it('rechaza factores negativos', () => {
    expect(() => parseFactorValue('-0.5')).toThrow(CarbonValueError);
    expect(() => parseFactorValue('-0')).toThrow(CarbonValueError);
  });

  it('permite factor cero cuando una fuente lo justifica', () => {
    expect(parseFactorValue('0').toFixed(8)).toBe('0.00000000');
    expect(activityEmissions('8.5', '0').toFixed(8)).toBe('0.00000000');
  });

  it('rechaza números JSON, notación científica y exceso de decimales', () => {
    for (const value of [0.5, '1e3', '0.123456789', '1234567890123', '', ' 1']) {
      expect(() => parseFactorValue(value)).toThrow(CarbonValueError);
    }
  });

  it('exige cantidad manual positiva', () => {
    expect(() => parseActivityQuantity('0')).toThrow(CarbonValueError);
    expect(parseActivityQuantity('8.50000000').toFixed(8)).toBe('8.50000000');
  });

  it('exige fuente no vacía en el DTO de creación', () => {
    const base = {
      code: 'TEST-ELECTRICITY',
      name: 'Electricidad de prueba',
      category: 'ENERGY',
      activityUnit: 'KWH',
      kgCo2ePerUnit: '0.50000000',
      sourceName: 'TEST_FIXTURE',
      sourceReference: 'TEST_FIXTURE',
    };
    const errors = (input: object) =>
      validateSync(plainToInstance(CreateEmissionFactorDto, input)).map((e) => e.property);
    expect(errors(base)).toEqual([]);
    expect(errors({ ...base, sourceName: '   ' })).toContain('sourceName');
    expect(errors({ ...base, sourceReference: undefined })).toContain('sourceReference');
    expect(errors({ ...base, kgCo2ePerUnit: '-1' })).toContain('kgCo2ePerUnit');
    expect(errors({ ...base, category: 'OTHER' })).toContain('category');
  });
});

describe('compatibilidad producto ↔ factor', () => {
  it('acepta GRAM con factor por KILOGRAM y MILLILITER con factor por LITER', () => {
    expect(
      productFactorViolation({ category: 'RAW_MATERIAL', activityUnit: 'KILOGRAM' }, 'GRAM'),
    ).toBe(null);
    expect(
      productFactorViolation({ category: 'PACKAGING', activityUnit: 'LITER' }, 'MILLILITER'),
    ).toBe(null);
  });

  it('rechaza LITER con factor por KILOGRAM y UNIT con KILOGRAM', () => {
    expect(
      productFactorViolation({ category: 'RAW_MATERIAL', activityUnit: 'KILOGRAM' }, 'LITER')?.code,
    ).toBe('INCOMPATIBLE_FACTOR_UNIT');
    expect(
      productFactorViolation({ category: 'RAW_MATERIAL', activityUnit: 'KILOGRAM' }, 'UNIT')?.code,
    ).toBe('INCOMPATIBLE_FACTOR_UNIT');
  });

  it('rechaza categorías que no son material consumido', () => {
    expect(
      productFactorViolation({ category: 'ENERGY', activityUnit: 'KILOGRAM' }, 'KILOGRAM')?.code,
    ).toBe('INVALID_PRODUCT_FACTOR_CATEGORY');
  });
});

describe('cálculo de huella', () => {
  it('calcula emisiones de actividad = cantidad × coeficiente', () => {
    expect(activityEmissions('5.00000000', '0.50000000').toFixed(8)).toBe('2.50000000');
    expect(activityEmissions('0.7', '2.1').toFixed(8)).toBe('1.47000000');
    // Redondeo único ROUND_HALF_UP a 8 decimales.
    expect(activityEmissions('0.00000001', '0.5').toFixed(8)).toBe('0.00000001');
    expect(activityEmissions('0.00000001', '0.49').toFixed(8)).toBe('0.00000000');
  });

  it('suma el total exacto y la intensidad por unidad', () => {
    const total = totalEmissions(['20.00000000', '2.50000000']);
    expect(total.toFixed(8)).toBe('22.50000000');
    expect(emissionIntensity(total, '200').toFixed(8)).toBe('0.11250000');
    expect(emissionIntensity(total, '100').toFixed(8)).toBe('0.22500000');
    expect(emissionIntensity('1', '3').toFixed(8)).toBe('0.33333333');
    expect(() => emissionIntensity('1', '0')).toThrow(CarbonValueError);
  });

  it('agrupa totales por las cinco categorías', () => {
    expect(
      totalsByCategory([
        { category: 'RAW_MATERIAL', emissionsKgCo2e: '14.5' },
        { category: 'ENERGY', emissionsKgCo2e: '4.2' },
        { category: 'ENERGY', emissionsKgCo2e: '0' },
      ]),
    ).toEqual({
      RAW_MATERIAL: '14.50000000',
      ENERGY: '4.20000000',
      INBOUND_TRANSPORT: '0.00000000',
      PACKAGING: '0.00000000',
      WASTE: '0.00000000',
    });
  });

  it('deriva una actividad por movimiento con ABS(cantidad) normalizada', () => {
    const plan = planAutomaticActivities(
      [
        {
          id: 'm1',
          productId: 'soda',
          quantity: D('-700.0000'),
          product: { id: 'soda', code: 'MP-SODA', name: 'Soda cáustica', unit: 'GRAM' },
        },
        {
          id: 'm2',
          productId: 'oil',
          quantity: D('-100000.0000'),
          product: { id: 'oil', code: 'MP-OIL', name: 'Aceite usado', unit: 'MILLILITER' },
        },
        {
          id: 'm3',
          productId: 'oil',
          quantity: D('-500.0000'),
          product: { id: 'oil', code: 'MP-OIL', name: 'Aceite usado', unit: 'MILLILITER' },
        },
      ],
      new Map([['soda', factor()]]),
    );
    expect(plan.activities).toHaveLength(1);
    expect(plan.activities[0]).toMatchObject({
      inventoryMovementId: 'm1',
      originalUnit: 'GRAM',
      activityUnit: 'KILOGRAM',
      factorCodeSnapshot: 'TEST-RAW-001',
    });
    expect(plan.activities[0].originalQuantity.toFixed(4)).toBe('700.0000');
    expect(plan.activities[0].activityQuantity.toFixed(8)).toBe('0.70000000');
    expect(plan.activities[0].emissionsKgCo2e.toFixed(8)).toBe('1.47000000');
    expect(plan.missingFactors).toEqual([
      {
        productId: 'oil',
        code: 'MP-OIL',
        name: 'Aceite usado',
        unit: 'MILLILITER',
        consumedQuantity: '100500.0000',
      },
    ]);
  });

  it('mantiene la circularidad separada de las emisiones', () => {
    const movements = [{ productId: 'oil', quantity: D('-100000.0000') }];
    const [metric] = circularityMetrics(
      [
        {
          id: 'p',
          productId: 'oil',
          metricCode: 'USED_COOKING_OIL_RECOVERED',
          displayName: 'Aceite de cocina usado valorizado',
          reportingUnit: 'LITER',
          product: { code: 'MP-OIL', name: 'Aceite usado', unit: 'MILLILITER' },
        },
      ],
      movements,
    );
    expect(metric.quantity).toBe('100.00000000');
    expect(metric.consumedQuantity).toBe('100000.0000');
    const plan = planAutomaticActivities([], new Map());
    expect(totalEmissions(plan.activities.map((a) => a.emissionsKgCo2e)).toFixed(8)).toBe(
      '0.00000000',
    );
  });
});
