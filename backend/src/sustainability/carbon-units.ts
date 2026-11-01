import { Prisma } from '../generated/prisma/client.js';
import type { CarbonActivityUnit, UnitOfMeasure } from '../generated/prisma/client.js';

/** Entrada decimal exacta: nunca number para valores persistentes. */
export type DecimalInput = Prisma.Decimal | string;

/**
 * Dimensiones físicas de las unidades de actividad (C3).
 *
 * Solo se convierte dentro de la misma dimensión y con factores exactos
 * (GRAM ↔ KILOGRAM, MILLILITER ↔ LITER). No existen densidades: LITER → KILOGRAM
 * o UNIT → KILOGRAM se rechazan siempre.
 */
export type CarbonDimension = 'COUNT' | 'MASS' | 'VOLUME' | 'ENERGY' | 'DISTANCE' | 'FREIGHT';

const UNITS: Record<CarbonActivityUnit, { dimension: CarbonDimension; toBase: string }> = {
  UNIT: { dimension: 'COUNT', toBase: '1' },
  GRAM: { dimension: 'MASS', toBase: '0.001' },
  KILOGRAM: { dimension: 'MASS', toBase: '1' },
  MILLILITER: { dimension: 'VOLUME', toBase: '0.001' },
  LITER: { dimension: 'VOLUME', toBase: '1' },
  KWH: { dimension: 'ENERGY', toBase: '1' },
  KILOMETER: { dimension: 'DISTANCE', toBase: '1' },
  TON_KILOMETER: { dimension: 'FREIGHT', toBase: '1' },
};

export const CARBON_ACTIVITY_UNITS = Object.keys(UNITS) as CarbonActivityUnit[];

/** Precisión de cálculo amplia: el redondeo ocurre una sola vez, al persistir. */
export const CarbonDecimal = Prisma.Decimal.clone({
  precision: 80,
  rounding: Prisma.Decimal.ROUND_HALF_UP,
});

export class IncompatibleUnitsError extends Error {
  constructor(
    readonly from: CarbonActivityUnit,
    readonly to: CarbonActivityUnit,
  ) {
    super(`No existe conversión dimensionalmente válida de ${from} a ${to}`);
    this.name = 'IncompatibleUnitsError';
  }
}

export function dimensionOf(unit: CarbonActivityUnit): CarbonDimension {
  return UNITS[unit].dimension;
}

/** Las unidades de inventario son un subconjunto exacto de las de actividad. */
export function productUnitAsActivityUnit(unit: UnitOfMeasure): CarbonActivityUnit {
  return unit;
}

export function areUnitsCompatible(a: CarbonActivityUnit, b: CarbonActivityUnit): boolean {
  return dimensionOf(a) === dimensionOf(b);
}

/**
 * Convierte una cantidad exacta entre unidades de la misma dimensión.
 * Acepta Decimal o texto y nunca pasa por number.
 */
export function convertQuantity(
  quantity: DecimalInput,
  from: CarbonActivityUnit,
  to: CarbonActivityUnit,
): Prisma.Decimal {
  if (!areUnitsCompatible(from, to)) throw new IncompatibleUnitsError(from, to);
  const value = new CarbonDecimal(String(quantity));
  if (from === to) return new Prisma.Decimal(value.toFixed());
  const converted = value.times(UNITS[from].toBase).dividedBy(UNITS[to].toBase);
  return new Prisma.Decimal(converted.toFixed());
}
