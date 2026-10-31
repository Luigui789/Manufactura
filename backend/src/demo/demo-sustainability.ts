import { AuditEntityType, Prisma } from '../generated/prisma/client.js';
import { productFactorViolation } from '../sustainability/carbon-rules.js';
import { areUnitsCompatible } from '../sustainability/carbon-units.js';
import {
  DEMO_CIRCULAR_PROFILE,
  DEMO_FACTOR_SOURCE,
  DEMO_FACTORS,
  DEMO_PRODUCTS,
} from './demo-data.js';
import { assertSame, drift, recordCreate, type SeedStats, type Tx } from './demo-context.js';

type Ids = Map<string, string>;

/** Factores DEMO-* con fuente «Supuesto académico EcoSoap»; reglas C3 intactas. */
export async function ensureDemoFactors(tx: Tx, stats: SeedStats, ids: Ids, actorId: string) {
  for (const spec of DEMO_FACTORS) {
    const productId = spec.productCode ? (ids.get(spec.productCode) ?? null) : null;
    const entity = 'EmissionFactor ' + spec.code;
    const expected = {
      category: spec.category,
      activityUnit: spec.activityUnit,
      kgCo2ePerUnit: new Prisma.Decimal(spec.kgCo2ePerUnit).toFixed(8),
      productId,
      sourceName: DEMO_FACTOR_SOURCE.sourceName,
      isActive: true,
    };
    const existing = await tx.emissionFactor.findUnique({ where: { code: spec.code } });
    if (existing) {
      assertSame(
        entity,
        { ...existing, kgCo2ePerUnit: existing.kgCo2ePerUnit.toFixed(8) },
        expected,
      );
      continue;
    }
    if (spec.productCode) {
      const product = DEMO_PRODUCTS.find((p) => p.code === spec.productCode)!;
      const violation = productFactorViolation(spec, product.unit);
      if (violation) drift(entity, violation.message);
      const other = await tx.emissionFactor.findFirst({ where: { productId, isActive: true } });
      if (other) drift(entity, `el producto ya tiene el factor activo ${other.code}`);
    }
    const factor = await tx.emissionFactor.create({
      data: {
        code: spec.code,
        name: spec.name,
        category: spec.category,
        activityUnit: spec.activityUnit,
        kgCo2ePerUnit: spec.kgCo2ePerUnit,
        productId,
        ...DEMO_FACTOR_SOURCE,
        notes:
          'Dataset oficial de demostración C5. Valor ilustrativo, no es un dato ambiental real.',
        createdByUserId: actorId,
      },
    });
    await recordCreate(tx, stats, AuditEntityType.EMISSION_FACTOR, factor.id, {
      ...spec,
      ...DEMO_FACTOR_SOURCE,
    });
  }
}

export async function ensureDemoCircularity(tx: Tx, stats: SeedStats, ids: Ids) {
  const spec = DEMO_CIRCULAR_PROFILE;
  const productId = ids.get(spec.productCode)!;
  const product = DEMO_PRODUCTS.find((p) => p.code === spec.productCode)!;
  if (!areUnitsCompatible(product.unit, spec.reportingUnit))
    drift('CircularMaterialProfile', 'unidad de reporte incompatible');
  const existing =
    (await tx.circularMaterialProfile.findUnique({ where: { productId } })) ??
    (await tx.circularMaterialProfile.findUnique({ where: { metricCode: spec.metricCode } }));
  if (existing) {
    assertSame('CircularMaterialProfile ' + spec.metricCode, existing, {
      productId,
      metricCode: spec.metricCode,
      reportingUnit: spec.reportingUnit,
      isActive: true,
    });
    return;
  }
  const created = await tx.circularMaterialProfile.create({
    data: {
      productId,
      metricCode: spec.metricCode,
      displayName: spec.displayName,
      reportingUnit: spec.reportingUnit,
    },
  });
  await recordCreate(tx, stats, AuditEntityType.CIRCULAR_MATERIAL_PROFILE, created.id, { ...spec });
}
