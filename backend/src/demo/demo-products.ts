import { AuditEntityType } from '../generated/prisma/client.js';
import { DEMO_CUSTOMERS, DEMO_PRODUCTS, DEMO_SUPPLIERS } from './demo-data.js';
import { assertSame, recordCreate, drift, type SeedStats, type Tx } from './demo-context.js';

/** Productos del caso por código; un código existente con otra semántica es drift. */
export async function ensureDemoProducts(tx: Tx, stats: SeedStats) {
  const ids = new Map<string, string>();
  for (const spec of DEMO_PRODUCTS) {
    const existing = await tx.product.findUnique({ where: { code: spec.code } });
    if (existing) {
      assertSame('Product ' + spec.code, existing, {
        type: spec.type,
        unit: spec.unit,
        isLotTracked: spec.isLotTracked,
        requiresQualityInspection: spec.requiresQualityInspection,
        isActive: true,
      });
      ids.set(spec.code, existing.id);
      continue;
    }
    const created = await tx.product.create({ data: spec });
    await recordCreate(tx, stats, AuditEntityType.PRODUCT, created.id, { ...spec });
    ids.set(spec.code, created.id);
  }
  return ids;
}

export async function ensureDemoParties(tx: Tx, stats: SeedStats) {
  for (const spec of DEMO_SUPPLIERS) {
    const existing = await tx.supplier.findUnique({ where: { code: spec.code } });
    if (existing) {
      if (!existing.isActive) drift('Supplier ' + spec.code, 'el proveedor está inactivo');
      continue;
    }
    const created = await tx.supplier.create({ data: spec });
    await recordCreate(tx, stats, AuditEntityType.SUPPLIER, created.id, { ...spec });
  }
  for (const spec of DEMO_CUSTOMERS) {
    const existing = await tx.customer.findUnique({ where: { code: spec.code } });
    if (existing) {
      if (!existing.isActive) drift('Customer ' + spec.code, 'el cliente está inactivo');
      continue;
    }
    const created = await tx.customer.create({ data: spec });
    await recordCreate(tx, stats, AuditEntityType.CUSTOMER, created.id, { ...spec });
  }
}
