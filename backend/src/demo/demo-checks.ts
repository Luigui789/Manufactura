import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { Prisma, type PrismaClient, RoleCode } from '../generated/prisma/client.js';
import { StartSimulationDto } from '../iiot/simulation/simulation.dto.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ManufacturingStructureService } from '../production/structure/manufacturing-structure.service.js';
import {
  DEMO_BOMS,
  DEMO_CIRCULAR_PROFILE,
  DEMO_CUSTOMERS,
  DEMO_FACTOR_SOURCE,
  DEMO_FACTORS,
  DEMO_IIOT_PROCESS,
  DEMO_INITIAL_STOCK,
  DEMO_INITIAL_STOCK_MARKER,
  DEMO_PRODUCTS,
  DEMO_ROUTES,
  DEMO_SUPPLIERS,
  DEMO_USERS,
  DEMO_WAREHOUSE_CODE,
  DEMO_ZERO_START,
  P,
} from './demo-data.js';

export type DemoCheck = { label: string; status: 'PASS' | 'READY' | 'FAIL'; detail?: string };
type Tx = Prisma.TransactionClient;
const dec = (value: Prisma.Decimal | string, places = 4) =>
  new Prisma.Decimal(value).toFixed(places);

class CheckFailure extends Error {}
function expect(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new CheckFailure(detail);
}

async function products(tx: Tx, codes: readonly string[]) {
  for (const code of codes) {
    const spec = DEMO_PRODUCTS.find((p) => p.code === code)!;
    const row = await tx.product.findUnique({ where: { code } });
    expect(row, `${code} no existe`);
    for (const key of [
      'name',
      'type',
      'unit',
      'isLotTracked',
      'requiresQualityInspection',
    ] as const)
      expect(row[key] === spec[key], `${code}.${key} = ${String(row[key])}`);
    expect(row.isActive, `${code} inactivo`);
  }
}

async function bom(tx: Tx, productCode: string) {
  const spec = DEMO_BOMS.find((b) => b.productCode === productCode)!;
  const row = await tx.billOfMaterial.findFirst({
    where: { product: { code: productCode } },
    include: {
      versions: { include: { items: { include: { componentProduct: true } } } },
    },
  });
  expect(row?.isActive, `fórmula de ${productCode} ausente o inactiva`);
  expect(row.versions.length === 1, `${productCode} tiene ${row.versions.length} versiones`);
  const [version] = row.versions;
  expect(version.isActive && version.version === 1, `${productCode} sin v1 activa`);
  expect(
    dec(version.outputQuantity) === dec(spec.outputQuantity),
    `${productCode} salida distinta`,
  );
  const actual = version.items.map((i) => `${i.componentProduct.code}=${dec(i.quantity)}`).sort();
  const expected = spec.items.map((i) => `${i.productCode}=${dec(i.quantity)}`).sort();
  expect(actual.join() === expected.join(), `${productCode} componentes ${actual.join()}`);
}

async function route(tx: Tx, code: string) {
  const spec = DEMO_ROUTES.find((r) => r.code === code)!;
  const row = await tx.productionRoute.findUnique({
    where: { code },
    include: { product: true, operations: { orderBy: { sequence: 'asc' } } },
  });
  expect(row?.isActive, `ruta ${code} ausente o inactiva`);
  expect(row.product.code === spec.productCode, `ruta ${code} de otro producto`);
  const actual = row.operations.map(
    (o) => `${o.sequence}|${o.name}|${o.standardMinutes.toFixed(2)}`,
  );
  const expected = spec.operations.map(
    (o) => `${o.sequence}|${o.name}|${dec(o.standardMinutes, 2)}`,
  );
  expect(actual.join() === expected.join(), `ruta ${code} operaciones distintas`);
  return row.operations.map((o) => o.name);
}

/** Verificación de solo lectura del dataset oficial. Nunca escribe en la base. */
export async function verifyDemoDataset(prisma: PrismaClient): Promise<DemoCheck[]> {
  const checks: DemoCheck[] = [];
  const run = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
      checks.push({ label, status: 'PASS' });
    } catch (error) {
      if (!(error instanceof CheckFailure)) throw error;
      checks.push({ label, status: 'FAIL', detail: error.message });
    }
  };
  await prisma.$transaction(async (tx) => {
    // Garantía física: cualquier escritura accidental falla en PostgreSQL.
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await run('Roles', async () => {
      const codes = (await tx.role.findMany()).map((r) => r.code).sort();
      expect(codes.join() === Object.values(RoleCode).sort().join(), `roles ${codes.join()}`);
    });
    await run('Demo users', async () => {
      for (const spec of DEMO_USERS) {
        const user = await tx.user.findUnique({
          where: { email: spec.email },
          include: { role: true },
        });
        expect(user, `${spec.email} no existe`);
        expect(user.role.code === spec.role && user.isActive, `${spec.email} rol/estado`);
        expect(user.fullName === spec.fullName, `${spec.email} nombre`);
      }
    });
    await run('Warehouse', async () => {
      const row = await tx.warehouse.findUnique({ where: { code: DEMO_WAREHOUSE_CODE } });
      expect(row?.isActive, `${DEMO_WAREHOUSE_CODE} ausente o inactivo`);
    });
    await run('Suppliers and customers', async () => {
      for (const s of DEMO_SUPPLIERS)
        expect((await tx.supplier.findUnique({ where: { code: s.code } }))?.isActive, s.code);
      for (const c of DEMO_CUSTOMERS)
        expect((await tx.customer.findUnique({ where: { code: c.code } }))?.isActive, c.code);
    });
    await run('Raw materials', () => products(tx, [P.ACU, P.NAOH, P.WATER, P.ESSENCE]));
    await run('Intermediate product', () => products(tx, [P.ACU_FIL]));
    await run('Bar soap', () => products(tx, [P.BAR]));
    await run('Liquid soap', () => products(tx, [P.LIQUID]));
    await run('Liquid packaging', () => products(tx, [P.BOTTLE, P.CAP, P.LABEL]));
    await run('Filtered-oil BOM', () => bom(tx, P.ACU_FIL));
    await run('Bar-soap BOM', () => bom(tx, P.BAR));
    await run('Liquid-soap BOM', () => bom(tx, P.LIQUID));
    await run('Filtering route', async () => void (await route(tx, 'RT-ACU-FIL')));
    await run('Bar-soap route', async () => void (await route(tx, 'RT-JABON-500')));
    await run('Liquid-soap route', async () => {
      const names = (await route(tx, 'RT-JABON-LIQ')).join(' | ');
      for (const step of [/embotellado/i, /tapado/i, /etiquetado/i])
        expect(step.test(names), `falta ${step.source} en la ruta líquida`);
    });
    await run('Initial stock', async () => {
      const marked = await tx.inventoryMovement.findMany({
        where: { requestId: DEMO_INITIAL_STOCK_MARKER, warehouse: { code: DEMO_WAREHOUSE_CODE } },
        include: { product: true },
      });
      expect(marked.length === DEMO_INITIAL_STOCK.length, `${marked.length} cargas iniciales`);
      for (const spec of DEMO_INITIAL_STOCK) {
        const rows = marked.filter((m) => m.product.code === spec.productCode);
        expect(rows.length === 1, `${spec.productCode}: ${rows.length} cargas`);
        expect(
          rows[0].type === 'ADJUSTMENT_IN' && rows[0].reason === 'INITIAL_LOAD',
          `${spec.productCode} no es ADJUSTMENT_IN/INITIAL_LOAD`,
        );
        expect(dec(rows[0].quantity) === dec(spec.quantity), `${spec.productCode} cantidad`);
      }
      for (const code of DEMO_ZERO_START)
        expect(!marked.some((m) => m.product.code === code), `${code} debe iniciar en cero`);
    });
    await run('Circularity', async () => {
      const spec = DEMO_CIRCULAR_PROFILE;
      const row = await tx.circularMaterialProfile.findUnique({
        where: { metricCode: spec.metricCode },
        include: { product: true },
      });
      expect(row?.isActive, `${spec.metricCode} ausente o inactivo`);
      expect(
        row.product.code === spec.productCode && row.reportingUnit === spec.reportingUnit,
        `${spec.metricCode} configuración distinta`,
      );
    });
    await run('Sustainability factors', async () => {
      for (const spec of DEMO_FACTORS) {
        const row = await tx.emissionFactor.findUnique({
          where: { code: spec.code },
          include: { product: true },
        });
        expect(row?.isActive, `${spec.code} ausente o inactivo`);
        expect(row.sourceName === DEMO_FACTOR_SOURCE.sourceName, `${spec.code} fuente`);
        expect(dec(row.kgCo2ePerUnit, 8) === dec(spec.kgCo2ePerUnit, 8), `${spec.code} valor`);
        expect((row.product?.code ?? null) === spec.productCode, `${spec.code} producto`);
      }
      // Todo componente consumido por las tres fórmulas tiene factor activo (sin faltantes C3).
      for (const code of new Set(DEMO_BOMS.flatMap((b) => b.items.map((i) => i.productCode))))
        expect(
          await tx.emissionFactor.findFirst({ where: { isActive: true, product: { code } } }),
          `${code} sin factor activo`,
        );
    });
  });
  // Lectura C4 (RepeatableRead, sin bloqueos ni escrituras) del árbol de fabricación.
  const structures = new ManufacturingStructureService(prisma as unknown as PrismaService);
  for (const [label, code] of [
    ['Bar manufacturing structure', P.BAR],
    ['Liquid manufacturing structure', P.LIQUID],
  ] as const) {
    const productRow = await prisma.product.findUnique({ where: { code } });
    if (!productRow) {
      checks.push({ label, status: 'FAIL', detail: `${code} no existe` });
      continue;
    }
    const tree = await structures.get(productRow.id);
    const child = tree.components.find((c) => c.product.code === P.ACU_FIL)?.child;
    const ok =
      tree.readiness === 'READY' &&
      tree.maxDepth === 2 &&
      child?.components.some((c) => c.product.code === P.ACU) === true;
    checks.push(
      ok
        ? { label, status: 'READY' }
        : { label, status: 'FAIL', detail: `${tree.readiness}, maxDepth ${tree.maxDepth}` },
    );
  }
  const iiot = Object.entries(DEMO_IIOT_PROCESS).map(
    ([code, process]) =>
      [
        code,
        validateSync(plainToInstance(StartSimulationDto, { process, scenario: 'normal' })),
      ] as const,
  );
  const invalid = iiot.filter(([, errors]) => errors.length).map(([code]) => code);
  checks.push(
    invalid.length
      ? { label: 'IIoT compatibility', status: 'FAIL', detail: invalid.join(', ') }
      : { label: 'IIoT compatibility', status: 'PASS' },
  );
  return checks;
}

export function formatChecks(checks: DemoCheck[]) {
  const lines = ['EcoSoap Demo Dataset'];
  for (const check of checks)
    lines.push(
      `${check.label}${'.'.repeat(Math.max(2, 34 - check.label.length))} ${check.status}` +
        (check.detail ? ` (${check.detail})` : ''),
    );
  const ready = checks.every((c) => c.status !== 'FAIL');
  lines.push(ready ? 'Dataset ready for demonstration.' : 'Dataset NOT ready: revisa los FAIL.');
  return { text: lines.join('\n') + '\n', ready };
}
