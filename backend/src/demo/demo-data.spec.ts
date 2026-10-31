import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { BomCalculatorService } from '../production/boms/bom-calculator.service.js';
import { productFactorViolation } from '../sustainability/carbon-rules.js';
import {
  BAR_DEMO_FLOW,
  DEMO_BOMS,
  DEMO_FACTOR_SOURCE,
  DEMO_FACTORS,
  DEMO_INITIAL_STOCK,
  DEMO_PRODUCTS,
  DEMO_ROUTES,
  DEMO_USERS,
  DEMO_ZERO_START,
  LIQUID_DEMO_BATCH,
  P,
} from './demo-data.js';
import { DemoInputError, readDemoPassword } from './demo-seeder.js';
import { demoPreflight } from './demo-input.js';

const product = (code: string) => DEMO_PRODUCTS.find((p) => p.code === code)!;
const bom = (code: string) => DEMO_BOMS.find((b) => b.productCode === code)!;
const calculate = (code: string, quantity: string) => {
  const spec = bom(code);
  const result = new BomCalculatorService().calculate(
    spec.outputQuantity,
    quantity,
    spec.items.map((i) => ({ productId: i.productCode, quantity: i.quantity })),
  );
  return Object.fromEntries(
    result.map((r) => [r.productId, new Prisma.Decimal(r.required).toString()]),
  );
};

describe('DEMO_USER_PASSWORD', () => {
  it('is mandatory and follows the password policy without echoing it', () => {
    for (const env of [{}, { DEMO_USER_PASSWORD: '' }, { DEMO_USER_PASSWORD: '   ' }])
      expect(() => readDemoPassword(env)).toThrow(DemoInputError);
    const short = 'corta-123';
    const error = (() => {
      try {
        readDemoPassword({ DEMO_USER_PASSWORD: short });
      } catch (e) {
        return e as Error;
      }
    })();
    expect(error).toBeInstanceOf(DemoInputError);
    expect(error?.message).not.toContain(short);
    expect(readDemoPassword({ DEMO_USER_PASSWORD: 'una frase local de demo' })).toBe(
      'una frase local de demo',
    );
  });
});

describe('demo preflight', () => {
  it('fails for a missing or short password and passes a valid one, without echoing it', () => {
    expect(demoPreflight({})).toMatchObject({ ok: false });
    const short = demoPreflight({ DEMO_USER_PASSWORD: 'corta-123' });
    expect(short.ok).toBe(false);
    expect(JSON.stringify(short)).not.toContain('corta-123');
    expect(demoPreflight({ DEMO_USER_PASSWORD: 'una frase local de demo' })).toEqual({ ok: true });
  });
});

describe('EcoSoap demo dataset definition', () => {
  it('declares five users, one per role, with .test addresses', () => {
    expect(DEMO_USERS.map((u) => u.role).sort()).toEqual([
      'ADMIN',
      'COMPRAS',
      'INVENTARIO',
      'PRODUCCION',
      'VENTAS',
    ]);
    expect(DEMO_USERS.every((u) => u.email.endsWith('@ecosoap.test'))).toBe(true);
  });

  it('has two quality-inspected finished goods sharing the filtered-oil intermediate', () => {
    for (const code of [P.BAR, P.LIQUID])
      expect(product(code)).toMatchObject({
        type: 'FINISHED_GOOD',
        unit: 'UNIT',
        isLotTracked: true,
        requiresQualityInspection: true,
      });
    expect(product(P.ACU_FIL).type).toBe('INTERMEDIATE');
    for (const code of [P.BAR, P.LIQUID])
      expect(bom(code).items.map((i) => i.productCode)).toContain(P.ACU_FIL);
    expect(bom(P.ACU_FIL).items).toEqual([{ productCode: P.ACU, quantity: '1000' }]);
  });

  it('keeps the documented bar formula and a liquid formula that is not a copy', () => {
    expect(bom(P.BAR).items).toEqual([
      { productCode: P.ACU_FIL, quantity: '500' },
      { productCode: P.NAOH, quantity: '70' },
      { productCode: P.WATER, quantity: '180' },
      { productCode: P.ESSENCE, quantity: '5' },
    ]);
    const chemistry = (code: string) =>
      bom(code)
        .items.filter((i) => product(i.productCode).type !== 'CONSUMABLE')
        .map((i) => `${i.productCode}=${i.quantity}`);
    expect(chemistry(P.LIQUID)).not.toEqual(chemistry(P.BAR));
    for (const code of [P.BOTTLE, P.CAP, P.LABEL])
      expect(product(code)).toMatchObject({ type: 'CONSUMABLE', unit: 'UNIT' });
  });

  it('scales liquid packaging exactly with BomCalculatorService', () => {
    expect(calculate(P.LIQUID, LIQUID_DEMO_BATCH.units)).toMatchObject({
      [P.BOTTLE]: '10',
      [P.CAP]: '10',
      [P.LABEL]: '10',
      [P.ACU_FIL]: LIQUID_DEMO_BATCH.filterOrder,
    });
    expect(calculate(P.BAR, BAR_DEMO_FLOW.barOrderUnits)).toEqual({
      [P.ACU_FIL]: BAR_DEMO_FLOW.filterOrder,
      [P.NAOH]: '700',
      [P.WATER]: '1800',
      [P.ESSENCE]: '50',
    });
  });

  it('has initial stock for one bar and one liquid demo batch, none for zero-start items', () => {
    const stock = Object.fromEntries(DEMO_INITIAL_STOCK.map((s) => [s.productCode, +s.quantity]));
    const bar = calculate(P.BAR, BAR_DEMO_FLOW.barOrderUnits);
    const liquid = calculate(P.LIQUID, LIQUID_DEMO_BATCH.units);
    for (const code of [P.NAOH, P.WATER, P.ESSENCE, P.BOTTLE, P.CAP, P.LABEL])
      expect(stock[code]).toBeGreaterThanOrEqual(
        Number(bar[code] ?? 0) + Number(liquid[code] ?? 0),
      );
    for (const code of DEMO_ZERO_START) expect(stock[code]).toBeUndefined();
    expect(
      Number(BAR_DEMO_FLOW.filterOrder) + Number(LIQUID_DEMO_BATCH.filterOrder),
    ).toBeLessThanOrEqual(Number(BAR_DEMO_FLOW.purchaseUsedOil));
  });

  it('routes the liquid soap through bottling, capping and labelling', () => {
    const liquid = DEMO_ROUTES.find((r) => r.productCode === P.LIQUID)!;
    const names = liquid.operations.map((o) => o.name);
    expect(names).toEqual(
      expect.arrayContaining(['Llenado / embotellado', 'Tapado', 'Etiquetado']),
    );
    expect(liquid.estimatedTimes).toBe(true);
    expect(
      DEMO_ROUTES.find((r) => r.productCode === P.BAR)!.operations.map((o) => o.standardMinutes),
    ).toEqual(['15', '10', '21600', '5', '5']);
  });

  it('declares DEMO factors as academic assumptions for every consumed component', () => {
    expect(DEMO_FACTOR_SOURCE.sourceName).toBe('Supuesto académico EcoSoap');
    expect(DEMO_FACTORS.every((f) => f.code.startsWith('DEMO-'))).toBe(true);
    const consumed = new Set(DEMO_BOMS.flatMap((b) => b.items.map((i) => i.productCode)));
    for (const code of consumed) {
      const factor = DEMO_FACTORS.find((f) => f.productCode === code);
      expect(factor, code).toBeDefined();
      expect(productFactorViolation(factor!, product(code).unit)).toBeNull();
    }
    for (const code of ['DEMO-BOTTLE', 'DEMO-CAP', 'DEMO-LABEL'])
      expect(DEMO_FACTORS.find((f) => f.code === code)?.category).toBe('PACKAGING');
  });
});
