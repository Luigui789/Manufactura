import { Prisma } from '../generated/prisma/client.js';
import type {
  CarbonActivityCategory,
  CarbonActivityUnit,
  UnitOfMeasure,
} from '../generated/prisma/client.js';
import { activityEmissions, assertStorable, CARBON_SCALE } from './carbon-math.js';
import {
  areUnitsCompatible,
  CarbonDecimal,
  convertQuantity,
  productUnitAsActivityUnit,
} from './carbon-units.js';

/** Categorías que pueden asociarse a un producto consumido por el ledger. */
export const PRODUCT_FACTOR_CATEGORIES: CarbonActivityCategory[] = ['RAW_MATERIAL', 'PACKAGING'];

export type RuleViolation = { code: string; message: string };

/**
 * Un factor ligado a producto debe medir la misma dimensión que Product.unit
 * (sin densidades) y pertenecer a una categoría de material consumido.
 */
export function productFactorViolation(
  factor: { category: CarbonActivityCategory; activityUnit: CarbonActivityUnit },
  productUnit: UnitOfMeasure,
): RuleViolation | null {
  if (!PRODUCT_FACTOR_CATEGORIES.includes(factor.category))
    return {
      code: 'INVALID_PRODUCT_FACTOR_CATEGORY',
      message: 'Un factor asociado a producto solo puede ser RAW_MATERIAL o PACKAGING',
    };
  if (!areUnitsCompatible(factor.activityUnit, productUnitAsActivityUnit(productUnit)))
    return {
      code: 'INCOMPATIBLE_FACTOR_UNIT',
      message: `La unidad ${factor.activityUnit} del factor no es compatible con la unidad ${productUnit} del producto; C3 no aplica densidades`,
    };
  return null;
}

export type FactorSnapshotSource = {
  id: string;
  code: string;
  name: string;
  category: CarbonActivityCategory;
  activityUnit: CarbonActivityUnit;
  kgCo2ePerUnit: Prisma.Decimal;
  sourceName: string;
  sourceReference: string;
  sourceYear: number | null;
};

/** Copia inmutable del factor: modificar el factor después no altera la actividad. */
export function factorSnapshot(factor: FactorSnapshotSource) {
  return {
    emissionFactorId: factor.id,
    category: factor.category,
    activityUnit: factor.activityUnit,
    factorCodeSnapshot: factor.code,
    factorNameSnapshot: factor.name,
    factorValueSnapshot: factor.kgCo2ePerUnit,
    factorSourceNameSnapshot: factor.sourceName,
    factorSourceReferenceSnapshot: factor.sourceReference,
    factorSourceYearSnapshot: factor.sourceYear,
  };
}

export type ConsumptionMovement = {
  id: string;
  productId: string;
  quantity: Prisma.Decimal;
  product: { id: string; code: string; name: string; unit: UnitOfMeasure };
};

export type MissingFactor = {
  productId: string;
  code: string;
  name: string;
  unit: UnitOfMeasure;
  consumedQuantity: string;
};

export type PlannedAutoActivity = ReturnType<typeof factorSnapshot> & {
  inventoryMovementId: string;
  description: string;
  activityQuantity: Prisma.Decimal;
  originalQuantity: Prisma.Decimal;
  originalUnit: CarbonActivityUnit;
  emissionsKgCo2e: Prisma.Decimal;
};

/**
 * Deriva las actividades automáticas exclusivamente de movimientos
 * PRODUCTION_CONSUMPTION reales: una actividad por movimiento, cantidad
 * ABS(quantity) normalizada a la unidad del factor. Sin factor activo no se
 * inventa ninguno: el producto queda en missingFactors.
 */
export function planAutomaticActivities(
  movements: ConsumptionMovement[],
  factorsByProduct: Map<string, FactorSnapshotSource>,
): { activities: PlannedAutoActivity[]; missingFactors: MissingFactor[] } {
  const activities: PlannedAutoActivity[] = [];
  const missing = new Map<string, MissingFactor & { total: InstanceType<typeof CarbonDecimal> }>();
  for (const movement of movements) {
    const consumed = new CarbonDecimal(movement.quantity.toString()).abs();
    const factor = factorsByProduct.get(movement.productId);
    if (!factor) {
      const entry = missing.get(movement.productId) ?? {
        productId: movement.productId,
        code: movement.product.code,
        name: movement.product.name,
        unit: movement.product.unit,
        consumedQuantity: '0',
        total: new CarbonDecimal(0),
      };
      entry.total = entry.total.plus(consumed);
      missing.set(movement.productId, entry);
      continue;
    }
    const originalUnit = productUnitAsActivityUnit(movement.product.unit);
    const originalQuantity = new Prisma.Decimal(consumed.toFixed());
    const activityQuantity = convertQuantity(originalQuantity, originalUnit, factor.activityUnit);
    activities.push({
      ...factorSnapshot(factor),
      inventoryMovementId: movement.id,
      description: `Consumo de ${movement.product.code} · ${movement.product.name}`.slice(0, 250),
      activityQuantity: assertStorable(activityQuantity, 'La cantidad de actividad'),
      originalQuantity,
      originalUnit,
      emissionsKgCo2e: activityEmissions(activityQuantity, factor.kgCo2ePerUnit),
    });
  }
  const missingFactors = [...missing.values()]
    .map(({ total, ...entry }) => ({ ...entry, consumedQuantity: total.toFixed(4) }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return { activities, missingFactors };
}

export type CircularProfileSource = {
  id: string;
  productId: string;
  metricCode: string;
  displayName: string;
  reportingUnit: CarbonActivityUnit;
  product: { code: string; name: string; unit: UnitOfMeasure };
};

/**
 * Cantidad de material circular valorizado en la OP: Σ ABS(consumo real) del
 * producto configurado, convertida a la unidad de reporte. Es un indicador
 * separado: nunca se resta de la huella de carbono.
 */
export function circularityMetrics(
  profiles: CircularProfileSource[],
  movements: Pick<ConsumptionMovement, 'productId' | 'quantity'>[],
) {
  return profiles.map((profile) => {
    const consumed = movements
      .filter((movement) => movement.productId === profile.productId)
      .reduce<InstanceType<typeof CarbonDecimal>>(
        (sum, movement) => sum.plus(new CarbonDecimal(movement.quantity.toString()).abs()),
        new CarbonDecimal(0),
      );
    const consumedUnit = productUnitAsActivityUnit(profile.product.unit);
    const quantity = convertQuantity(consumed.toFixed(), consumedUnit, profile.reportingUnit);
    return {
      profileId: profile.id,
      metricCode: profile.metricCode,
      displayName: profile.displayName,
      productId: profile.productId,
      productCode: profile.product.code,
      productName: profile.product.name,
      consumedQuantity: consumed.toFixed(4),
      consumedUnit,
      quantity: quantity.toFixed(CARBON_SCALE),
      reportingUnit: profile.reportingUnit,
    };
  });
}
