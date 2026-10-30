import { describe, expect, it } from 'vitest';
import { Prisma, type IiotMetric } from '../../generated/prisma/client.js';
import { RuleEngineService } from './rule-engine.service.js';

const engine = new RuleEngineService();
// Independent acceptance values, including all boundaries and their inner neighbours.
const cases: [IiotMetric, string, string, string, string, string, string, string][] = [
  ['TEMPERATURE', '°C', '0', '10', '50', '55', 'LOW_TEMPERATURE', 'HIGH_TEMPERATURE'],
  ['HUMIDITY', '%', '20', '30', '70', '78', 'LOW_HUMIDITY', 'HIGH_HUMIDITY'],
  ['PH', 'pH', '8', '8.5', '10', '11', 'PH_OUT_OF_RANGE', 'PH_OUT_OF_RANGE'],
  ['TANK_LEVEL', '%', '15', '30', '95', '99', 'LOW_TANK_LEVEL', 'HIGH_TANK_LEVEL'],
  ['MIXER_RPM', 'RPM', '150', '250', '420', '470', 'LOW_MIXER_RPM', 'HIGH_MIXER_RPM'],
];
for (const [
  metric,
  unit,
  criticalLow,
  warningLow,
  warningHigh,
  criticalHigh,
  lowType,
  highType,
] of cases) {
  describe(metric, () => {
    const delta = new Prisma.Decimal('0.0001');
    const low = new Prisma.Decimal(warningLow);
    const high = new Prisma.Decimal(warningHigh);
    it.each([
      [low.plus(delta).toString(), null, null],
      [high.minus(delta).toString(), null, null],
      [criticalLow, 'CRITICAL', lowType],
      [new Prisma.Decimal(criticalLow).minus(delta).toString(), 'CRITICAL', lowType],
      [new Prisma.Decimal(criticalLow).plus(delta).toString(), 'WARNING', lowType],
      [warningLow, 'WARNING', lowType],
      [warningHigh, 'WARNING', highType],
      [new Prisma.Decimal(criticalHigh).minus(delta).toString(), 'WARNING', highType],
      [criticalHigh, 'CRITICAL', highType],
      [new Prisma.Decimal(criticalHigh).plus(delta).toString(), 'CRITICAL', highType],
    ])('%s -> %s %s (single decision, critical first)', (value, severity, type) => {
      const reading = { metric, unit, value: new Prisma.Decimal(value) };
      const result = engine.evaluate(reading);
      expect(engine.evaluate(reading)).toEqual(result);
      if (severity === null) expect(result).toBeNull();
      else {
        expect(result).toMatchObject({ severity, type });
        expect(result!.message).toContain(metric);
        expect(result!.message).toContain(reading.value.toFixed(4));
        expect(result!.message).toContain(unit);
        expect(result!.message).toContain(`demo ${severity.toLowerCase()}`);
        expect(Array.isArray(result)).toBe(false);
      }
    });
    it('does not apply a threshold in another unit', () => {
      expect(
        engine.evaluate({ metric, unit: 'other', value: new Prisma.Decimal(criticalHigh) }),
      ).toBeNull();
    });
  });
}
it.each([
  ['TEMPERATURE', '°C', '27'],
  ['PH', 'pH', '9.4'],
  ['MIXER_RPM', 'RPM', '350'],
] as const)('%s nominal example', (metric, unit, value) => {
  expect(engine.evaluate({ metric, unit, value: new Prisma.Decimal(value) })).toBeNull();
});
