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
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, randomPassword, type TestApp } from './support/auth-test-kit.js';

let kit: TestApp;
let hash: string;
const password = randomPassword();
const productCodes = DEMO_PRODUCTS.map((p) => p.code);
const data = <T>(r: { body: unknown }) => (r.body as { data: T }).data;
const repoRoot = new URL('../../', import.meta.url).pathname;
const PgClient = (
  createRequire(createRequire(import.meta.url).resolve('@prisma/adapter-pg'))('pg') as {
    Client: new (options: { connectionString: string }) => {
      connect(): Promise<void>;
      query(sql: string): Promise<{ rows: Record<string, string>[] }>;
      end(): Promise<void>;
    };
  }
).Client;

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
    for (const label of ['Initial stock ledger', 'Current inventory readiness', 'Demo users'])
      expect(checks.find((c) => c.label === label)?.status).toBe('PASS');
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

  it.each([
    ['mustChangePassword', { mustChangePassword: true }],
    ['fullName', { fullName: 'Administración renombrada' }],
  ] as const)(
    'rejects a demo user with a different %s as drift and rolls back',
    async (field, change) => {
      const email = 'admin.demo@ecosoap.test';
      const original = await kit.prisma.user.findUniqueOrThrow({ where: { email } });
      await kit.prisma.user.update({ where: { email }, data: change });
      try {
        const before = await snapshot();
        const audits = await kit.prisma.auditLog.count();
        const error = await seedDemoDataset(kit.prisma, hash).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(DemoDatasetDriftError);
        expect((error as Error).message).toContain(`User ${email}`);
        expect((error as Error).message).toContain(field);
        expect(await snapshot()).toEqual(before);
        expect(await kit.prisma.auditLog.count()).toBe(audits);
        // La contraseña existente nunca se compara ni se sobrescribe.
        const row = await kit.prisma.user.findUniqueOrThrow({ where: { email } });
        expect(row.passwordHash).toBe(original.passwordHash);
        const users = (await verifyDemoDataset(kit.prisma)).find((c) => c.label === 'Demo users');
        expect(users?.status).toBe('FAIL');
      } finally {
        await kit.prisma.user.update({
          where: { email },
          data: { mustChangePassword: original.mustChangePassword, fullName: original.fullName },
        });
      }
      expect((await seedDemoDataset(kit.prisma, hash)).created).toEqual({});
    },
  );

  /** Operaciones reales por la API (InventoryService), nunca escribiendo StockBalance. */
  async function adminApi() {
    const cookie = await login(kit, { email: 'admin.demo@ecosoap.test', password });
    return (method: 'get' | 'post', url: string) => kit.http()[method](url).set('Cookie', cookie);
  }
  const readiness = async () => {
    const checks = await verifyDemoDataset(kit.prisma);
    return {
      ready: formatChecks(checks).ready,
      ledger: checks.find((c) => c.label === 'Initial stock ledger'),
      current: checks.find((c) => c.label === 'Current inventory readiness'),
    };
  };
  const balance = async (code: string) =>
    (
      await kit.prisma.stockBalance.findFirst({
        where: { product: { code }, warehouse: { code: 'ALM-PRINCIPAL' } },
      })
    )?.quantity.toFixed(4) ?? '0.0000';

  it('fails readiness after consuming baseline stock; the seed does not replenish it', async () => {
    const api = await adminApi();
    const naoh = await kit.prisma.product.findUniqueOrThrow({ where: { code: P.NAOH } });
    const warehouse = await kit.prisma.warehouse.findUniqueOrThrow({
      where: { code: 'ALM-PRINCIPAL' },
    });
    const adjust = (type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT') =>
      api('post', '/api/inventory/adjustments')
        .send({
          productId: naoh.id,
          warehouseId: warehouse.id,
          type,
          quantity: '100',
          reason: 'CORRECTION',
        })
        .expect(201);
    expect((await readiness()).ready).toBe(true);
    await adjust('ADJUSTMENT_OUT');
    try {
      expect(await balance(P.NAOH)).toBe('19900.0000');
      const used = await readiness();
      expect(used.ready).toBe(false);
      expect(used.ledger?.status).toBe('PASS');
      expect(used.current?.status).toBe('FAIL');
      expect(used.current?.detail).toContain('MP-NAOH 19900.0000 GRAM (esperado 20000.0000)');
      // Idempotente ≠ reset: el seed no repone lo consumido.
      expect((await seedDemoDataset(kit.prisma, hash)).created).toEqual({});
      expect(await balance(P.NAOH)).toBe('19900.0000');
      // verify es de solo lectura incluso cuando falla.
      const movements = await kit.prisma.inventoryMovement.count();
      const balances = await kit.prisma.stockBalance.findMany({ orderBy: { id: 'asc' } });
      const audits = await kit.prisma.auditLog.count();
      await verifyDemoDataset(kit.prisma);
      expect(await kit.prisma.inventoryMovement.count()).toBe(movements);
      expect(await kit.prisma.stockBalance.findMany({ orderBy: { id: 'asc' } })).toEqual(balances);
      expect(await kit.prisma.auditLog.count()).toBe(audits);
    } finally {
      await adjust('ADJUSTMENT_IN');
    }
    expect(await balance(P.NAOH)).toBe('20000.0000');
    expect((await readiness()).ready).toBe(true);
  });

  it('fails readiness when a zero-start product (MP-ACU) has stock from a real receipt', async () => {
    const api = await adminApi();
    const acu = await kit.prisma.product.findUniqueOrThrow({ where: { code: P.ACU } });
    const supplier = await kit.prisma.supplier.findUniqueOrThrow({
      where: { code: 'SUP-ACU-001' },
    });
    const warehouse = await kit.prisma.warehouse.findUniqueOrThrow({
      where: { code: 'ALM-PRINCIPAL' },
    });
    const order = data<{ id: string; items: { id: string }[] }>(
      await api('post', '/api/purchase-orders')
        .send({
          supplierId: supplier.id,
          items: [{ productId: acu.id, quantity: '100', unitPrice: '0' }],
        })
        .expect(201),
    );
    await api('post', `/api/purchase-orders/${order.id}/confirm`).send({}).expect(200);
    await api('post', `/api/purchase-orders/${order.id}/receive`)
      .send({
        items: [
          { purchaseOrderItemId: order.items[0].id, warehouseId: warehouse.id, quantity: '100' },
        ],
      })
      .expect(201);
    const lot = await kit.prisma.lot.findFirstOrThrow({
      where: { purchaseReceiptItem: { orderItem: { purchaseOrderId: order.id } } },
    });
    try {
      expect(await balance(P.ACU)).toBe('100.0000');
      const used = await readiness();
      expect(used.ready).toBe(false);
      expect(used.ledger?.status).toBe('PASS');
      expect(used.current?.status).toBe('FAIL');
      expect(used.current?.detail).toContain('MP-ACU 100.0000 MILLILITER (esperado 0.0000)');
    } finally {
      await api('post', '/api/inventory/adjustments')
        .send({
          productId: acu.id,
          warehouseId: warehouse.id,
          lotId: lot.id,
          type: 'ADJUSTMENT_OUT',
          quantity: '100',
          reason: 'CORRECTION',
        })
        .expect(201);
    }
    expect(await balance(P.ACU)).toBe('0.0000');
    expect((await readiness()).ready).toBe(true);
  });

  it('pnpm demo:seed without DEMO_USER_PASSWORD fails before Foundation writes anything', async () => {
    // Base vacía aislada con todas las migraciones: el comando oficial debe fallar en el
    // preflight, antes de db:seed, sin crear roles, almacén, usuarios ni movimientos.
    const base = new URL(process.env.DATABASE_URL!);
    const name = `${base.pathname.slice(1)}_preflight_${randomUUID().slice(0, 8)}`;
    const admin = new PgClient({ connectionString: base.toString() });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    const target = new URL(base.toString());
    target.pathname = '/' + name;
    target.search = '';
    const db = new PgClient({ connectionString: target.toString() });
    try {
      await db.connect();
      const migrations = new URL('../prisma/migrations/', import.meta.url);
      for (const dir of (await readdir(migrations)).filter((n) => /^\d/.test(n)).sort())
        await db.query(await readFile(new URL(dir + '/migration.sql', migrations), 'utf8'));
      const env = { ...process.env, DATABASE_URL: target.toString() };
      delete env.DEMO_USER_PASSWORD;
      const result = spawnSync('pnpm', ['demo:seed'], { cwd: repoRoot, env, encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toContain('DEMO_USER_PASSWORD es obligatoria');
      expect(result.stdout).not.toContain('Seed Foundation aplicado');
      for (const table of [
        'roles',
        'warehouses',
        'users',
        'products',
        'inventory_movements',
        'audit_logs',
      ])
        expect((await db.query(`SELECT count(*)::text AS n FROM ${table}`)).rows[0].n, table).toBe(
          '0',
        );
    } finally {
      await db.end().catch(() => undefined);
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  }, 180000);

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
