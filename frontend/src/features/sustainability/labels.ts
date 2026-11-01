import type { CarbonCategory, CarbonUnit, FootprintStatus } from './api/sustainability';

export const CATEGORY_LABELS: Record<CarbonCategory, string> = {
  RAW_MATERIAL: 'Materias primas',
  ENERGY: 'Energía',
  INBOUND_TRANSPORT: 'Transporte de entrada',
  PACKAGING: 'Empaque',
  WASTE: 'Residuos',
};
export const UNIT_SYMBOLS: Record<CarbonUnit, string> = {
  UNIT: 'unidad',
  GRAM: 'g',
  KILOGRAM: 'kg',
  MILLILITER: 'mL',
  LITER: 'L',
  KWH: 'kWh',
  KILOMETER: 'km',
  TON_KILOMETER: 't·km',
};
export const FOOTPRINT_STATUS_LABELS: Record<FootprintStatus | 'NONE', string> = {
  NONE: 'Sin calcular',
  DRAFT: 'Borrador',
  FINALIZED: 'Finalizado',
};
/** Unidades de actividad compatibles con cada unidad de producto (sin densidades). */
export const COMPATIBLE_UNITS: Record<string, CarbonUnit[]> = {
  UNIT: ['UNIT'],
  GRAM: ['GRAM', 'KILOGRAM'],
  KILOGRAM: ['GRAM', 'KILOGRAM'],
  MILLILITER: ['MILLILITER', 'LITER'],
  LITER: ['MILLILITER', 'LITER'],
};

/**
 * Presenta un decimal exacto sin pasar por number: recorta ceros finales y
 * conserva al menos `min` decimales.
 */
export function trimDecimal(value: string, min = 2): string {
  const [integer, fraction = ''] = value.split('.');
  const trimmed = fraction.replace(/0+$/, '');
  const decimals = trimmed.length >= min ? trimmed : trimmed.padEnd(min, '0');
  return decimals ? `${integer}.${decimals}` : integer;
}
export const kg = (value: string) => `${trimDecimal(value)} kg CO₂e`;
export const quantity = (value: string, unit: CarbonUnit) =>
  `${trimDecimal(value, 0)} ${UNIT_SYMBOLS[unit]}`;
