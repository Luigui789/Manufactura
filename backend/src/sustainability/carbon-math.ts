import { Prisma } from '../generated/prisma/client.js';
import type { CarbonActivityCategory } from '../generated/prisma/client.js';
import { CarbonDecimal, type DecimalInput } from './carbon-units.js';

/** Escala de los campos Decimal(20, 8) de kg CO₂e, coeficientes y actividades. */
export const CARBON_SCALE = 8;
/** Decimal(20, 8) admite como máximo 12 dígitos enteros. */
const MAX_EXCLUSIVE = new CarbonDecimal('1e12');

export const CARBON_CATEGORIES: CarbonActivityCategory[] = [
  'RAW_MATERIAL',
  'ENERGY',
  'INBOUND_TRANSPORT',
  'PACKAGING',
  'WASTE',
];

export class CarbonValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CarbonValueError';
  }
}

/** Texto decimal no negativo de hasta 12 enteros y 8 decimales (Decimal(20, 8)). */
export const FACTOR_VALUE_PATTERN = /^\d{1,12}(?:\.\d{1,8})?$/;
/** Cantidad positiva de actividad manual con la misma precisión. */
export const ACTIVITY_QUANTITY_PATTERN = /^\d{1,12}(?:\.\d{1,8})?$/;

/**
 * Valida un coeficiente kg CO₂e/unidad. El cero se admite (puede tener fuente que
 * lo justifique); el negativo nunca: C3 no modela emisiones evitadas.
 */
export function parseFactorValue(value: unknown): Prisma.Decimal {
  if (typeof value !== 'string' || !FACTOR_VALUE_PATTERN.test(value))
    throw new CarbonValueError(
      'El coeficiente debe ser texto decimal no negativo con hasta 12 enteros y 8 decimales',
    );
  return new Prisma.Decimal(value);
}

export function parseActivityQuantity(value: unknown): Prisma.Decimal {
  if (typeof value !== 'string' || !ACTIVITY_QUANTITY_PATTERN.test(value) || !/[1-9]/.test(value))
    throw new CarbonValueError(
      'La cantidad debe ser texto decimal mayor que cero con hasta 12 enteros y 8 decimales',
    );
  return new Prisma.Decimal(value);
}

/** Valida que un valor ya calculado cabe en Decimal(20, 8) sin perder enteros. */
export function assertStorable(value: DecimalInput, label: string): Prisma.Decimal {
  const decimal = new CarbonDecimal(String(value));
  if (decimal.isNegative()) throw new CarbonValueError(`${label} no puede ser negativo`);
  const rounded = decimal.toDecimalPlaces(CARBON_SCALE, CarbonDecimal.ROUND_HALF_UP);
  if (rounded.greaterThanOrEqualTo(MAX_EXCLUSIVE))
    throw new CarbonValueError(`${label} excede la precisión admitida (12 enteros)`);
  return new Prisma.Decimal(rounded.toFixed(CARBON_SCALE));
}

/**
 * emissionsKgCo2e = activityQuantity × kgCo2ePerUnit, redondeado una sola vez
 * a 8 decimales con ROUND_HALF_UP.
 */
export function activityEmissions(
  activityQuantity: DecimalInput,
  kgCo2ePerUnit: DecimalInput,
): Prisma.Decimal {
  const quantity = new CarbonDecimal(String(activityQuantity));
  const factor = new CarbonDecimal(String(kgCo2ePerUnit));
  if (quantity.isNegative() || factor.isNegative())
    throw new CarbonValueError('Cantidad y coeficiente deben ser no negativos');
  return assertStorable(quantity.times(factor), 'La emisión calculada');
}

/** totalKgCo2e = Σ emissionsKgCo2e (suma exacta de valores ya persistibles). */
export function totalEmissions(values: DecimalInput[]): Prisma.Decimal {
  const total = values.reduce<InstanceType<typeof CarbonDecimal>>(
    (sum, value) => sum.plus(String(value)),
    new CarbonDecimal(0),
  );
  return assertStorable(total, 'La huella total');
}

/** kgCo2ePerOutputUnit = totalKgCo2e / quantityProduced, 8 decimales ROUND_HALF_UP. */
export function emissionIntensity(
  totalKgCo2e: DecimalInput,
  quantityProduced: DecimalInput,
): Prisma.Decimal {
  const produced = new CarbonDecimal(String(quantityProduced));
  if (!produced.greaterThan(0))
    throw new CarbonValueError('La cantidad producida debe ser mayor que cero');
  return assertStorable(
    new CarbonDecimal(String(totalKgCo2e)).dividedBy(produced),
    'La intensidad',
  );
}

export type CategoryTotals = Record<CarbonActivityCategory, string>;

export function totalsByCategory(
  activities: { category: CarbonActivityCategory; emissionsKgCo2e: DecimalInput }[],
): CategoryTotals {
  const totals = {} as CategoryTotals;
  for (const category of CARBON_CATEGORIES)
    totals[category] = totalEmissions(
      activities.filter((a) => a.category === category).map((a) => a.emissionsKgCo2e),
    ).toFixed(CARBON_SCALE);
  return totals;
}

export function formatCarbon(value: DecimalInput): string {
  return new Prisma.Decimal(String(value)).toFixed(CARBON_SCALE);
}
