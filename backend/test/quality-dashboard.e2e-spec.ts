import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma, RoleCode } from '../src/generated/prisma/client.js';
import { QualityService } from '../src/production/quality/quality.service.js';
import { DispositionService } from '../src/production/quality/disposition.service.js';
import type { DashboardService } from '../src/production/quality/dashboard/dashboard.service.js';
import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';
import {
  createInventoryProduct,
  createInventoryWarehouse,
  createInventoryLot,
} from './support/inventory-fixtures.js';

type Dashboard = Awaited<ReturnType<DashboardService['get']>>;
type Produced = { lot: { id: string; status: string }; id: string; number: string };
let kit: TestApp;
let admin: string;
let reader: string;
let inspectorId: string;
let rawId: string;
let warehouseId: string;
const endpoint = '/api/production/quality/dashboard';
const payload = <T>(r: { body: unknown }) => (r.body as { data: T }).data;
const post = (url: string) => kit.http().post(url).set('Cookie', admin);
const lotBase = (id: string) => `/api/production/lots/${id}`;
async function read(productId?: string, filters: Record<string, string> = {}) {
  const params = new URLSearchParams({ ...(productId ? { productId } : {}), ...filters });
  return payload<Dashboard>(
    await kit.http().get(`${endpoint}?${params}`).set('Cookie', reader).expect(200),
  );
}
async function product(
  quality = true,
  isActive = true,
  type: 'INTERMEDIATE' | 'FINISHED_GOOD' = 'FINISHED_GOOD',
) {
  return kit.prisma.product.create({
    data: {
      code: `D5-${randomUUID()}`,
      name: 'Calidad D5',
      category: 'D5',
      type,
      unit: 'UNIT',
      isLotTracked: true,
      requiresQualityInspection: quality,
      isActive,
    },
  });
}
async function produced(selected?: Awaited<ReturnType<typeof product>>) {
  const output = selected ?? (await product());
  const bom =
    (await kit.prisma.billOfMaterial.findUnique({
      where: { productId: output.id },
      include: { versions: true },
    })) ??
    (await kit.prisma.billOfMaterial.create({
      data: {
        productId: output.id,
        name: 'D5',
        versions: {
          create: {
            version: 1,
            outputQuantity: '1',
            isActive: true,
            createdByUserId: inspectorId,
            items: { create: { componentProductId: rawId, quantity: '1' } },
          },
        },
      },
      include: { versions: true },
    }));
  const op = payload<Produced>(
    await post('/api/production/orders')
      .send({
        productId: output.id,
        bomVersionId: bom.versions[0].id,
        warehouseId,
        quantityPlanned: '2',
      })
      .expect(201),
  );
  await post(`/api/production/orders/${op.id}/start`).send({}).expect(200);
  const completed = payload<Produced>(
    await post(`/api/production/orders/${op.id}/complete`)
      .send({ quantityProduced: '2', allocations: [] })
      .expect(200),
  );
  return { output, op: completed, lotId: completed.lot.id };
}
// Database defaults use CURRENT_TIMESTAMP, so replacing Date alone cannot date these events.
// A test-only Prisma extension supplies the persistence clock at INSERT while exercising the
// real HTTP API, auth, writer, audit, ledger and DB constraints. No UPDATE of immutable events.
async function at<T>(time: string | undefined, action: () => Promise<T>) {
  if (!time) return action();
  const timed = kit.prisma.$extends({
    query: {
      qualityInspection: {
        create({ args, query }) {
          args.data.inspectedAt = new Date(time);
          args.data.createdAt = new Date(time);
          return query(args);
        },
      },
      qualityDisposition: {
        create({ args, query }) {
          args.data.decidedAt = new Date(time);
          return query(args);
        },
      },
    },
  });
  const quality = kit.app.get(QualityService);
  const disposition = kit.app.get(DispositionService);
  const originalQuality: unknown = Reflect.get(quality, 'prisma');
  const originalDisposition: unknown = Reflect.get(disposition, 'prisma');
  Reflect.set(quality, 'prisma', timed);
  Reflect.set(disposition, 'prisma', timed);
  try {
    return await action();
  } finally {
    Reflect.set(quality, 'prisma', originalQuality);
    Reflect.set(disposition, 'prisma', originalDisposition);
  }
}
async function inspect(lotId: string, result: 'APPROVED' | 'REJECTED', time?: string) {
  return at(time, async () =>
    payload<{ id: string; inspectedAt: string }>(
      await post(`${lotBase(lotId)}/inspection`)
        .send({
          result,
          observations: 'Inspección humana',
          ...(result === 'REJECTED'
            ? { nonConformities: 'Texto libre: temperatura, pH; sin taxonomía ni causalidad' }
            : {}),
        })
        .expect(201),
    ),
  );
}
async function dispose(lotId: string, type: 'RELEASE' | 'REWORK' | 'SCRAP', time?: string) {
  return at(time, async () =>
    payload<{ decidedAt: string }>(
      await post(`${lotBase(lotId)}/disposition`)
        .send({ type, reason: 'Decisión humana' })
        .expect(201),
    ),
  );
}
beforeAll(async () => {
  kit = await createTestApp();
  const actor = await createUser(kit, RoleCode.ADMIN);
  inspectorId = actor.id;
  admin = await login(kit, actor);
  reader = await login(kit, await createUser(kit, RoleCode.COMPRAS));
  rawId = (await createInventoryProduct(kit.prisma)).id;
  warehouseId = (await createInventoryWarehouse(kit.prisma)).id;
  await post('/api/inventory/adjustments')
    .send({
      productId: rawId,
      warehouseId,
      type: 'ADJUSTMENT_IN',
      quantity: '10000',
      reason: 'INITIAL_LOAD',
    })
    .expect(201);
}, 30000);
afterAll(async () => {
  if (kit) await kit.close();
});

describe('D5 quality dashboard PostgreSQL', () => {
  it('requires authentication and permits COMPRAS read access', async () => {
    await kit.http().get(endpoint).expect(401);
    await kit.http().get(endpoint).set('Cookie', reader).expect(200);
  });
  it.each([
    'from=2026-02-30',
    'to=invalid',
    'from=0000-01-01',
    'from=2026-11-02&to=2026-11-01',
    'from=2025-01-01&to=2026-01-02',
    'productId=invalid',
    'productId=12',
    'from=2026-1-01',
  ])('rejects invalid query %s', async (query) => {
    await kit.http().get(`${endpoint}?${query}`).set('Cookie', reader).expect(400);
  });
  it('returns 404 for a missing product', async () => {
    await kit.http().get(`${endpoint}?productId=${randomUUID()}`).set('Cookie', reader).expect(404);
  });
  it('defaults to 30 Managua days including today at a UTC day boundary', async () => {
    const d = await read();
    const today = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Managua',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value]),
    );
    expect(d.period.to).toBe(`${today.year}-${today.month}-${today.day}`);
    expect((Date.parse(d.period.to) - Date.parse(d.period.from)) / 86400000 + 1).toBe(30);
    expect(d.period.timeZone).toBe('America/Managua');
  });
  it('permits an inactive product without quality activity and returns zeros and null rate', async () => {
    const p = await product(false, false);
    const d = await read(p.id);
    expect(d.selectedProduct).toEqual({ id: p.id, code: p.code, name: p.name });
    expect(d.current).toEqual({ pendingInspection: 0, rejectedAwaitingDisposition: 0, rework: 0 });
    expect(d.inspections).toEqual({ total: 0, approved: 0, rejected: 0, approvalRatePct: null });
    expect(d.dispositions).toEqual({ total: 0, release: 0, rework: 0, scrap: 0 });
    expect(d.attention).toEqual([]);
    expect(d.recentInspections).toEqual([]);
  });
  it('does not count a produced lot without quality requirements or generic purchase quarantine', async () => {
    const f = await produced(await product(false));
    expect(f.op.lot.status).toBe('RELEASED');
    await createInventoryLot(kit.prisma, f.output.id, 'QUARANTINED');
    const d = await read(f.output.id);
    expect(d.current.pendingInspection).toBe(0);
    expect(d.inspections.total).toBe(0);
  });
  it('counts produced INTERMEDIATE quarantine independent of dates and removes it upon APPROVED', async () => {
    const f = await produced(await product(true, true, 'INTERMEDIATE'));
    expect(f.op.lot.status).toBe('QUARANTINED');
    const before = await read(f.output.id);
    expect(before.current.pendingInspection).toBe(1);
    expect(before.attention[0]).toMatchObject({
      kind: 'PENDING_INSPECTION',
      lot: { id: f.lotId },
      productionOrder: { id: f.op.id, number: f.op.number },
    });
    const lot = await kit.prisma.lot.findUniqueOrThrow({ where: { id: f.lotId } });
    expect(before.attention[0].since).toBe(lot.originatedAt.toISOString());
    expect((await read(f.output.id, { from: '2020-01-01', to: '2020-01-02' })).current).toEqual(
      before.current,
    );
    await inspect(f.lotId, 'APPROVED');
    const d = await read(f.output.id);
    expect(d.current.pendingInspection).toBe(0);
    expect(d.inspections).toEqual({
      total: 1,
      approved: 1,
      rejected: 0,
      approvalRatePct: '100.00',
    });
    expect(d.recentInspections[0]).toMatchObject({
      lot: { id: f.lotId, status: 'RELEASED' },
      inspectedBy: { id: inspectorId },
      productionOrder: { id: f.op.id },
    });
    await post(`${lotBase(f.lotId)}/inspection`)
      .send({ result: 'APPROVED', observations: 'Otra' })
      .expect(409);
  });
  it.each(['RELEASE', 'REWORK', 'SCRAP'] as const)(
    'preserves rejection after real %s and reconciles ledger',
    async (type) => {
      const f = await produced();
      const inspection = await inspect(f.lotId, 'REJECTED');
      const before = await read(f.output.id);
      expect(before.current).toEqual({
        pendingInspection: 0,
        rejectedAwaitingDisposition: 1,
        rework: 0,
      });
      expect(before.attention[0]).toMatchObject({
        kind: 'REJECTED_AWAITING_DISPOSITION',
        since: inspection.inspectedAt,
      });
      await dispose(f.lotId, type);
      const d = await read(f.output.id);
      expect(d.inspections).toEqual({
        total: 1,
        approved: 0,
        rejected: 1,
        approvalRatePct: '0.00',
      });
      expect(d.dispositions).toEqual({
        total: 1,
        release: Number(type === 'RELEASE'),
        rework: Number(type === 'REWORK'),
        scrap: Number(type === 'SCRAP'),
      });
      expect(d.current).toEqual({
        pendingInspection: 0,
        rejectedAwaitingDisposition: 0,
        rework: Number(type === 'REWORK'),
      });
      expect(d.attention).toEqual([]);
      expect(d.recentInspections[0]).toMatchObject({
        result: 'REJECTED',
        lot: { status: { RELEASE: 'RELEASED', REWORK: 'REWORK', SCRAP: 'SCRAPPED' }[type] },
        disposition: { type },
      });
      const movements = await kit.prisma.inventoryMovement.findMany({ where: { lotId: f.lotId } });
      expect(
        movements.filter((m) => m.type === 'QUALITY_SCRAP').map((m) => m.quantity.toFixed(4)),
      ).toEqual(type === 'SCRAP' ? ['-2.0000'] : []);
      const balance = await kit.prisma.stockBalance.findUniqueOrThrow({
        where: { productId_warehouseId: { productId: f.output.id, warehouseId } },
      });
      expect(balance.quantity.toFixed(4)).toBe(type === 'SCRAP' ? '0.0000' : '2.0000');
      const sum = movements.reduce((s, m) => s.add(m.quantity), new Prisma.Decimal(0));
      expect(sum.equals(balance.quantity)).toBe(true);
      await kit
        .http()
        .post(`${lotBase(f.lotId)}/disposition`)
        .set('Cookie', reader)
        .send({ type, reason: 'Sin permiso' })
        .expect(403);
    },
  );
  it('does not grant inspection mutation to a reader', async () => {
    const f = await produced();
    await kit
      .http()
      .post(`${lotBase(f.lotId)}/inspection`)
      .set('Cookie', reader)
      .send({ result: 'APPROVED', observations: 'Sin permiso' })
      .expect(403);
  });
  it('computes the exact Decimal rate by lot, isolates product and never infers defect or physical metrics', async () => {
    const p = await product();
    for (const result of ['APPROVED', 'APPROVED', 'REJECTED'] as const)
      await inspect((await produced(p)).lotId, result);
    const d = await read(p.id);
    expect(d.inspections).toEqual({ total: 3, approved: 2, rejected: 1, approvalRatePct: '66.67' });
    expect(d.recentInspections.every((r) => r.product.id === p.id)).toBe(true);
    expect(Object.keys(d.current).sort()).toEqual([
      'pendingInspection',
      'rejectedAwaitingDisposition',
      'rework',
    ]);
    expect(Object.keys(d.dispositions).sort()).toEqual(['release', 'rework', 'scrap', 'total']);
    expect(JSON.stringify(d)).not.toMatch(
      /totalScrappedQuantity|totalRejectedQuantity|totalReworkQuantity|defectCategories|pareto|rootCause|causality|yield|OEE/,
    );
  });
  it('uses inspectedAt and decidedAt independently at exact Managua boundaries with current context', async () => {
    const p = await product();
    const times = [
      '2026-11-01T05:59:59.999Z',
      '2026-11-01T06:00:00.000Z',
      '2026-11-02T05:59:59.999Z',
      '2026-11-02T06:00:00.000Z',
    ];
    const fixtures = [];
    for (const time of times) {
      const f = await produced(p);
      fixtures.push(f);
      const i = await inspect(f.lotId, 'REJECTED', time);
      expect(i.inspectedAt).toBe(time);
    }
    await dispose(fixtures[0].lotId, 'SCRAP', times[1]); // prior-period rejection, current disposition
    await dispose(fixtures[1].lotId, 'RELEASE', times[3]); // current rejection, future context
    await dispose(fixtures[2].lotId, 'REWORK', times[2]);
    await dispose(fixtures[3].lotId, 'RELEASE', times[3]);
    const prior = await produced(p);
    await inspect(prior.lotId, 'REJECTED', '2026-10-30T12:00:00Z');
    await dispose(prior.lotId, 'RELEASE', times[0]);
    const d = await read(p.id, { from: '2026-11-01', to: '2026-11-01' });
    expect(d.inspections).toEqual({ total: 2, approved: 0, rejected: 2, approvalRatePct: '0.00' });
    expect(d.dispositions).toEqual({ total: 2, release: 0, rework: 1, scrap: 1 });
    expect(d.inspectionsByPeriod).toEqual([{ period: '2026-11-01', approved: 0, rejected: 2 }]);
    expect(d.dispositionsByPeriod).toEqual([
      { period: '2026-11-01', release: 0, rework: 1, scrap: 1 },
    ]);
    expect(d.recentInspections.map((r) => r.lot.id)).toEqual([
      fixtures[2].lotId,
      fixtures[1].lotId,
    ]);
    expect(d.recentInspections[1].disposition).toEqual({ type: 'RELEASE', decidedAt: times[3] });
    expect((await read(p.id, { from: '2020-01-01', to: '2020-01-01' })).current).toEqual(d.current);
  });
  it.each([
    ['2026-01-01', '2026-01-31', 'day', 31],
    ['2026-01-01', '2026-02-01', 'week', 5],
    ['2026-01-01', '2026-06-29', 'week', 27],
    ['2026-01-01', '2026-06-30', 'month', 6],
    ['2024-01-01', '2024-12-31', 'month', 12],
  ])('fills zero buckets %sâ€“%s with %s granularity', async (from, to, granularity, length) => {
    const p = await product();
    const d = await read(p.id, { from: String(from), to: String(to) });
    expect(d.period.granularity).toBe(granularity);
    expect(d.inspectionsByPeriod).toHaveLength(Number(length));
    expect(d.dispositionsByPeriod).toHaveLength(Number(length));
    expect(d.inspectionsByPeriod.every((r) => r.approved === 0 && r.rejected === 0)).toBe(true);
    expect(
      d.dispositionsByPeriod.every((r) => r.release === 0 && r.rework === 0 && r.scrap === 0),
    ).toBe(true);
  });
  it('limits and orders attention by kind, age then lot id and recent inspections by timestamp, creation and id', async () => {
    const p = await product();
    const pending = await produced(p);
    await kit.prisma.lot.update({
      where: { id: pending.lotId },
      data: { originatedAt: new Date('2020-01-01T12:00:00Z') },
    });
    const rejected = [];
    for (let n = 0; n < 6; n++) {
      const f = await produced(p);
      await inspect(f.lotId, 'REJECTED', '2026-11-01T12:00:00Z');
      rejected.push(f);
    }
    const d = await read(p.id, { from: '2026-11-01', to: '2026-11-01' });
    expect(d.attention).toHaveLength(5);
    expect(d.attention.every((r) => r.kind === 'REJECTED_AWAITING_DISPOSITION')).toBe(true);
    expect(d.attention.map((r) => r.lot.id)).toEqual(
      rejected
        .map((f) => f.lotId)
        .sort()
        .slice(0, 5),
    );
    expect(d.recentInspections).toHaveLength(5);
    const expected = await kit.prisma.qualityInspection.findMany({
      where: { lot: { productId: p.id } },
      orderBy: [{ inspectedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
    });
    expect(d.recentInspections.map((r) => r.id)).toEqual(expected.map((r) => r.id));
    expect(d.recentInspections.map((r) => r.id)).toEqual(
      [...d.recentInspections.map((r) => r.id)].sort().reverse(),
    );
    const other = await product();
    expect((await read(other.id)).attention).toEqual([]);
  });
  it('orders pending lots oldest first with id as the tie break and no date-window filter', async () => {
    const p = await product();
    const lots = [];
    for (let n = 0; n < 3; n++) {
      const f = await produced(p);
      const since = n === 0 ? '2020-01-02T12:00:00Z' : '2020-01-01T12:00:00Z';
      await kit.prisma.lot.update({
        where: { id: f.lotId },
        data: { originatedAt: new Date(since) },
      });
      lots.push({ id: f.lotId, since });
    }
    const d = await read(p.id, { from: '2026-11-01', to: '2026-11-01' });
    expect(d.attention.map((r) => r.lot.id)).toEqual(
      lots
        .sort((a, b) => a.since.localeCompare(b.since) || a.id.localeCompare(b.id))
        .map((r) => r.id),
    );
    expect(d.inspections.total).toBe(0);
    expect(d.current.pendingInspection).toBe(3);
  });
  it.each([
    ['2026-01-01', '2026-01-31', '2026-01-31', null],
    ['2026-01-01', '2026-02-01', '2026-01-26', '2026-01-26'],
    ['2026-01-01', '2026-06-30', '2026-01-01', '2026-02-01'],
  ])(
    'groups real inspection and disposition events in %s–%s',
    async (from, to, inspectionBucket, dispositionBucket) => {
      const f = await produced();
      await inspect(f.lotId, 'REJECTED', '2026-02-01T05:59:59.999Z');
      await dispose(f.lotId, 'REWORK', '2026-02-01T06:00:00.000Z');
      const d = await read(f.output.id, { from, to });
      expect(d.inspectionsByPeriod.filter((r) => r.rejected)).toEqual([
        { period: inspectionBucket, approved: 0, rejected: 1 },
      ]);
      expect(d.dispositionsByPeriod.filter((r) => r.rework)).toEqual(
        dispositionBucket ? [{ period: dispositionBucket, release: 0, rework: 1, scrap: 0 }] : [],
      );
      expect(d.current.rework).toBe(1);
    },
  );
  it('uses identical PostgreSQL timezone boundaries for counts and recent rows in historical dates', async () => {
    const p = await product();
    const [{ start }] = await kit.prisma.$queryRaw<
      { start: Date }[]
    >`SELECT ('1900-01-01'::date::timestamp AT TIME ZONE 'America/Managua') AS start`;
    const outside = await produced(p);
    const inside = await produced(p);
    await inspect(outside.lotId, 'REJECTED', new Date(start.getTime() - 1).toISOString());
    await inspect(inside.lotId, 'APPROVED', start.toISOString());
    const d = await read(p.id, { from: '1900-01-01', to: '1900-01-01' });
    expect(d.inspections).toEqual({
      total: 1,
      approved: 1,
      rejected: 0,
      approvalRatePct: '100.00',
    });
    expect(d.recentInspections.map((r) => r.lot.id)).toEqual([inside.lotId]);
  });
});
