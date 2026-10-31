import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordHasherService } from '../src/auth/password-hasher.service.js';
import { formatChecks, verifyDemoDataset } from '../src/demo/demo-checks.js';
import { DemoDatasetDriftError } from '../src/demo/demo-context.js';
import {
  DEMO_BOMS,
  DEMO_CUSTOMERS,
  DEMO_FACTORS,
  DEMO_INITIAL_STOCK_MARKER,
  DEMO_PRODUCTS,
  DEMO_ROUTES,
  DEMO_SUPPLIERS,
  DEMO_USERS,
  LIQUID_DEMO_BATCH,
  P,
} from '../src/demo/demo-data.js';
import { seedDemoDataset } from '../src/demo/demo-seeder.js';
import { createTestApp, login, randomPassword, type TestApp } from './support/auth-test-kit.js';

let kit: TestApp;
let hash: string;
const password = randomPassword();
const productCodes = DEMO_PRODUCTS.map((p) => p.code);
const data = <T>(r: { body: unknown }) => (r.body as { data: T }).data;

/** Conteos del dataset (incluye ambos terminados y el packaging líquido). */
async function snapshot() {
  const db = kit.prisma;
  const products = { code: { in: productCodes } };
  return {
    users: await db.user.count({ where: { email: { in: DEMO_USERS.map((u) => u.email) } } }),
    products: await db.product.count({ where: products }),
    suppliers: await db.supplier.count({
      where: { code: { in: DEMO_SUPPLIERS.map((s) => s.code) } },
    }),
    customers: await db.customer.count({
      where: { code: { in: DEMO_CUSTOMERS.map((c) => c.code) } },
    }),
    boms: await db.billOfMaterial.count({ where: { product: products } }),
    bomVersions: await db.bomVersion.count({ where: { bom: { product: products } } }),
    bomItems: await db.bomItem.count({ where: { bomVersion: { bom: { product: products } } } }),
    routes: await db.productionRoute.count({ where: { product: products } }),
    operations: await db.routeOperation.count({ where: { route: { product: products } } }),
    initialMovements: await db.inventoryMovement.count({
      where: { requestId: DEMO_INITIAL_STOCK_MARKER },
    }),
    circularProfiles: await db.circularMaterialProfile.count({ where: { product: products } }),
    emissionFactors: await db.emissionFactor.count({
      where: { code: { in: DEMO_FACTORS.map((f) => f.code) } },
    }),
  };
}
const expectedCounts = {
  users: 5,
  products: 10,
  suppliers: 3,
  customers: 2,
  boms: 3,
  bomVersions: 3,
  bomItems: DEMO_BOMS.reduce((n, b) => n + b.items.length, 0),
  routes: 3,
  operations: DEMO_ROUTES.reduce((n, r) => n + r.operations.length, 0),
  initialMovements: 6,
  circularProfiles: 1,
  emissionFactors: 9,
};

beforeAll(async () => {
  kit = await createTestApp();
  hash = await kit.app.get(PasswordHasherService).hash(password);
  // Base _test compartida: otras suites desactivan administradores y una corrida previa pudo
  // crear las cuentas con otra contraseña (el seed nunca la cambia). La prueba parte de
  // cuentas activas con la contraseña de esta ejecución.
  await kit.prisma.user.updateMany({
    where: { email: { in: DEMO_USERS.map((u) => u.email) } },
    data: { isActive: true, passwordHash: hash },
  });
}, 30000);
afterAll(async () => {
  if (kit) await kit.close();
});

describe('C5 EcoSoap demo dataset', () => {
  it('two concurrent seeds produce a single dataset', async () => {
    const results = await Promise.allSettled([
      seedDemoDataset(kit.prisma, hash),
      seedDemoDataset(kit.prisma, hash),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await snapshot()).toEqual(expectedCounts);
  }, 60000);

  it('is idempotent: a second run changes nothing and creates no transactions', async () => {
    const demoProducts = await kit.prisma.product.findMany({
      where: { code: { in: productCodes } },
    });
    const ids = demoProducts.map((p) => p.id);
    const transactions = async () => ({
      orders: await kit.prisma.productionOrder.count(),
      lots: await kit.prisma.lot.count(),
      readings: await kit.prisma.iiotReading.count(),
      alerts: await kit.prisma.iiotAlert.count(),
      inspections: await kit.prisma.qualityInspection.count(),
      dispositions: await kit.prisma.qualityDisposition.count(),
      sales: await kit.prisma.saleOrder.count(),
      dispatches: await kit.prisma.saleDispatch.count(),
      footprints: await kit.prisma.productionFootprint.count(),
      movements: await kit.prisma.inventoryMovement.count(),
    });
    const before = await snapshot();
    const tx = await transactions();
    const audits = await kit.prisma.auditLog.count();
    const stats = await seedDemoDataset(kit.prisma, hash);
    expect(stats.created).toEqual({});
    expect(await snapshot()).toEqual(before);
    expect(await transactions()).toEqual(tx);
    expect(await kit.prisma.auditLog.count()).toBe(audits);
    // El seed solo escribe stock por la marca inicial; nada más toca los productos demo.
    expect(
      await kit.prisma.inventoryMovement.count({
        where: {
          productId: { in: ids },
          type: 'ADJUSTMENT_IN',
          requestId: { not: DEMO_INITIAL_STOCK_MARKER },
        },
      }),
    ).toBe(0);
    for (const code of [P.ACU, P.ACU_FIL, P.BAR, P.LIQUID])
      expect(
        await kit.prisma.stockBalance.count({ where: { product: { code }, quantity: { not: 0 } } }),
      ).toBe(0);
  }, 60000);

  it('verify passes, both structures are READY and verification is read-only', async () => {
    const before = await snapshot();
    const audits = await kit.prisma.auditLog.count();
    const movements = await kit.prisma.inventoryMovement.count();
    const checks = await verifyDemoDataset(kit.prisma);
    const { ready, text } = formatChecks(checks);
    expect(checks.filter((c) => c.status === 'FAIL')).toEqual([]);
    expect(ready).toBe(true);
    expect(text).toContain('Bar manufacturing structure....... READY');
    expect(text).toContain('Liquid manufacturing structure.... READY');
    expect(text).toContain('Dataset ready for demonstration.');
    expect(await snapshot()).toEqual(before);
    expect(await kit.prisma.auditLog.count()).toBe(audits);
    expect(await kit.prisma.inventoryMovement.count()).toBe(movements);
  });

  it.each([
    [P.LIQUID, { type: 'RAW_MATERIAL' as const }],
    [P.BOTTLE, { unit: 'LITER' as const }],
    [P.BAR, { requiresQualityInspection: false }],
  ])('rejects %s with incompatible semantics as DEMO_DATASET_DRIFT', async (code, change) => {
    const original = await kit.prisma.product.findUniqueOrThrow({ where: { code } });
    await kit.prisma.product.update({ where: { code }, data: change });
    try {
      const before = await snapshot();
      const error = await seedDemoDataset(kit.prisma, hash).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DemoDatasetDriftError);
      expect((error as DemoDatasetDriftError).code).toBe('DEMO_DATASET_DRIFT');
      expect((error as Error).message).toContain(code);
      expect(await snapshot()).toEqual(before);
    } finally {
      await kit.prisma.product.update({
        where: { code },
        data: {
          type: original.type,
          unit: original.unit,
          requiresQualityInspection: original.requiresQualityInspection,
        },
      });
    }
    expect((await seedDemoDataset(kit.prisma, hash)).created).toEqual({});
  });

  it('demo users log in with DEMO_USER_PASSWORD and keep their roles', async () => {
    for (const user of DEMO_USERS) {
      const cookie = await login(kit, { email: user.email, password });
      const me = await kit.http().get('/api/auth/me').set('Cookie', cookie).expect(200);
      expect(data<{ role: string; fullName: string }>(me)).toMatchObject({
        role: user.role,
        fullName: user.fullName,
      });
    }
  });

  it('liquid route bottles, caps and labels; requirements stay one level deep', async () => {
    const cookie = await login(kit, { email: 'produccion.demo@ecosoap.test', password });
    const api = (method: 'get' | 'post', url: string) =>
      kit.http()[method](url).set('Cookie', cookie);
    const liquid = await kit.prisma.product.findUniqueOrThrow({ where: { code: P.LIQUID } });
    const route = await kit.prisma.productionRoute.findUniqueOrThrow({
      where: { code: 'RT-JABON-LIQ' },
    });
    const detail = data<{ operationCount: number; operations: { name: string }[] }>(
      await api('get', '/api/production/routes/' + route.id).expect(200),
    );
    expect(detail.operationCount).toBeGreaterThanOrEqual(2);
    const names = detail.operations.map((o) => o.name).join(' | ');
    for (const step of ['Llenado / embotellado', 'Tapado', 'Etiquetado'])
      expect(names).toContain(step);

    const structure = data<{ readiness: string; maxDepth: number }>(
      await api('get', '/api/production/manufacturing-structure/' + liquid.id).expect(200),
    );
    expect(structure).toMatchObject({ readiness: 'READY', maxDepth: 2 });

    const bom = await kit.prisma.billOfMaterial.findUniqueOrThrow({
      where: { productId: liquid.id },
      include: { versions: { where: { isActive: true } } },
    });
    const warehouse = await kit.prisma.warehouse.findUniqueOrThrow({
      where: { code: 'ALM-PRINCIPAL' },
    });
    const order = data<{ id: string }>(
      await api('post', '/api/production/orders')
        .send({
          productId: liquid.id,
          bomVersionId: bom.versions[0].id,
          warehouseId: warehouse.id,
          quantityPlanned: LIQUID_DEMO_BATCH.units,
        })
        .expect(201),
    );
    const requirements = data<{ items: { product: { code: string }; required: string }[] }>(
      await api('get', `/api/production/orders/${order.id}/requirements`).expect(200),
    );
    const required = Object.fromEntries(
      requirements.items.map((i) => [i.product.code, i.required]),
    );
    expect(required).toEqual({
      [P.ACU_FIL]: '1500.0000',
      [P.NAOH]: '200.0000',
      [P.WATER]: '3000.0000',
      [P.ESSENCE]: '30.0000',
      [P.BOTTLE]: '10.0000',
      [P.CAP]: '10.0000',
      [P.LABEL]: '10.0000',
    });
    expect(required[P.ACU]).toBeUndefined();
  });
});
