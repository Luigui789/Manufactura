import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LotStatus, ProductType, RoleCode } from '../src/generated/prisma/client.js';
import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';
import {
  createInventoryLot,
  createInventoryProduct,
  createInventoryWarehouse,
} from './support/inventory-fixtures.js';
import type { DashboardService } from '../src/inventory/dashboard/dashboard.service.js';

type Dashboard = Awaited<ReturnType<DashboardService['get']>>;
let kit: TestApp;
let cookie: string;
let actorId: string;
const endpoint = '/api/inventory/dashboard';
const read = async (filters: Record<string, string> = {}) => {
  const response = await kit
    .http()
    .get(`${endpoint}?${new URLSearchParams({ from: '2026-10-01', to: '2026-10-03', ...filters })}`)
    .set('Cookie', cookie)
    .expect(200);
  return (response.body as { data: Dashboard }).data;
};
beforeAll(async () => {
  kit = await createTestApp();
  const actor = await createUser(kit, RoleCode.ADMIN);
  actorId = actor.id;
  cookie = await login(kit, actor);
}, 30000);
afterAll(async () => {
  if (kit) await kit.close();
});

describe('Inventory dashboard PostgreSQL', () => {
  it('requires a session', async () => {
    await kit.http().get(endpoint).expect(401);
  });
  it.each([
    'from=2026-02-30',
    'from=0000-01-01',
    'to=2026-13-01',
    'from=2026-1-01',
    'from=not-a-date',
    'from=2026-10-03&to=2026-10-01',
    'from=2025-01-01&to=2026-01-02',
    'productId=invalid',
    'warehouseId=invalid',
    'from=2026-10-01T00:00:00Z',
  ])('rejects invalid filters: %s', async (query) => {
    await kit.http().get(`${endpoint}?${query}`).set('Cookie', cookie).expect(400);
  });
  it.each(['productId', 'warehouseId'])('returns 404 for missing %s', async (key) => {
    await kit.http().get(`${endpoint}?${key}=${randomUUID()}`).set('Cookie', cookie).expect(404);
  });
  it('defaults to 30 calendar days including today in Managua', async () => {
    const response = await kit.http().get(endpoint).set('Cookie', cookie).expect(200);
    const d = (response.body as { data: Dashboard }).data;
    expect((Date.parse(d.period.to) - Date.parse(d.period.from)) / 86400000 + 1).toBe(30);
    expect(d.period.timeZone).toBe('America/Managua');
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Managua',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const today = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    expect(d.period.to).toBe(`${today.year}-${today.month}-${today.day}`);
  });
  it('counts active catalog by all four types and active warehouses globally', async () => {
    const before = await read();
    for (const type of Object.values(ProductType)) {
      const p = await createInventoryProduct(kit.prisma);
      await kit.prisma.product.update({ where: { id: p.id }, data: { type } });
    }
    const inactive = await createInventoryProduct(kit.prisma);
    await kit.prisma.product.update({ where: { id: inactive.id }, data: { isActive: false } });
    const w = await createInventoryWarehouse(kit.prisma);
    const inactiveWarehouse = await createInventoryWarehouse(kit.prisma);
    await kit.prisma.warehouse.update({
      where: { id: inactiveWarehouse.id },
      data: { isActive: false },
    });
    const after = await read({ productId: inactive.id, warehouseId: w.id });
    expect(after.catalog.activeProducts).toBe(before.catalog.activeProducts + 4);
    expect(after.catalog.activeWarehouses).toBe(before.catalog.activeWarehouses + 1);
    for (const key of ['rawMaterial', 'intermediate', 'finishedGood', 'consumable'] as const)
      expect(after.catalog.productsByType[key]).toBe(before.catalog.productsByType[key] + 1);
  });
  it('returns empty-safe catalog counts when no products or warehouses are active', async () => {
    const products = await kit.prisma.product.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const warehouses = await kit.prisma.warehouse.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    try {
      await kit.prisma.product.updateMany({
        where: { id: { in: products.map((p) => p.id) } },
        data: { isActive: false },
      });
      await kit.prisma.warehouse.updateMany({
        where: { id: { in: warehouses.map((w) => w.id) } },
        data: { isActive: false },
      });
      expect((await read()).catalog).toEqual({
        activeProducts: 0,
        activeWarehouses: 0,
        productsByType: { rawMaterial: 0, intermediate: 0, finishedGood: 0, consumable: 0 },
      });
    } finally {
      await kit.prisma.product.updateMany({
        where: { id: { in: products.map((p) => p.id) } },
        data: { isActive: true },
      });
      await kit.prisma.warehouse.updateMany({
        where: { id: { in: warehouses.map((w) => w.id) } },
        data: { isActive: true },
      });
    }
  });
  it('returns zeros for a product without stock and never mixes units globally', async () => {
    const p = await createInventoryProduct(kit.prisma);
    const d = await read({ productId: p.id });
    expect(d.stock).toEqual({
      onHand: '0.0000',
      consumable: '0.0000',
      unit: p.unit,
      byWarehouse: [],
    });
    expect(d.movementQuantity).toEqual({
      in: '0.0000',
      out: '0.0000',
      net: '0.0000',
      unit: p.unit,
    });
    expect(d.stockPositions.withOnHand).toBe(0);
    expect(d.lotsOnHand.total).toBe(0);
    expect(d.movements.total).toBe(0);
    expect(d.recentMovements).toEqual([]);
    expect(d.movementsByPeriod.every((point) => point.count === 0)).toBe(true);
    const all = await read();
    expect(all.stock).toBeNull();
    expect(all.movementQuantity).toBeNull();
  });
  it('uses signed quantities, filters exact Managua boundaries, keeps current stock independent of dates and limits recent rows', async () => {
    const p = await createInventoryProduct(kit.prisma);
    const w = await createInventoryWarehouse(kit.prisma);
    const other = await createInventoryWarehouse(kit.prisma);
    const rows = [
      ['2026-10-01T05:59:59.999Z', '100'],
      ['2026-10-01T06:00:00.000Z', '10.1250'],
      ['2026-10-02T06:00:00.000Z', '-2.0000'],
      ['2026-10-02T07:00:00.000Z', '1'],
      ['2026-10-02T08:00:00.000Z', '1'],
      ['2026-10-02T09:00:00.000Z', '1'],
      ['2026-10-04T06:00:00.000Z', '100'],
    ];
    for (const [occurredAt, quantity] of rows)
      await kit.prisma.inventoryMovement.create({
        data: {
          productId: p.id,
          warehouseId: w.id,
          quantity,
          occurredAt: new Date(occurredAt),
          type: quantity.startsWith('-') ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN',
          reason: 'INITIAL_LOAD',
          performedByUserId: actorId,
        },
      });
    await kit.prisma.$executeRaw`
      INSERT INTO inventory_movements
        (id, product_id, warehouse_id, quantity, type, reason, performed_by_user_id, occurred_at)
      VALUES (gen_random_uuid(), ${p.id}::uuid, ${w.id}::uuid, 1,
        'ADJUSTMENT_IN', 'INITIAL_LOAD', ${actorId}::uuid, '2026-10-04T05:59:59.999999Z'::timestamptz)
    `;
    await kit.prisma.stockBalance.create({
      data: { productId: p.id, warehouseId: w.id, quantity: '212.1250' },
    });
    await kit.prisma.stockBalance.create({
      data: { productId: p.id, warehouseId: other.id, quantity: '0' },
    });
    const d = await read({ productId: p.id, warehouseId: w.id });
    expect(d.stockPositions.withOnHand).toBe(1);
    expect(d.stock).toMatchObject({ onHand: '212.1250', consumable: '212.1250' });
    expect(d.stock?.byWarehouse).toHaveLength(1);
    expect(d.movementQuantity).toMatchObject({ in: '14.1250', out: '2.0000', net: '12.1250' });
    expect(d.movements).toMatchObject({ total: 6, byType: { adjustmentIn: 5, adjustmentOut: 1 } });
    expect(d.movementsByPeriod.map((row) => row.count)).toEqual([1, 4, 1]);
    expect(d.recentMovements).toHaveLength(5);
    expect(d.recentMovements[0]).toMatchObject({
      quantity: '1.0000',
      product: { id: p.id },
      warehouse: { id: w.id },
      performedByUser: { id: actorId },
      businessReference: null,
    });
    const past = await read({
      productId: p.id,
      warehouseId: w.id,
      from: '2020-01-01',
      to: '2020-01-01',
    });
    expect(past.stock).toEqual(d.stock);
    expect(past.lotsOnHand).toEqual(d.lotsOnHand);
    expect(past.movements.total).toBe(0);
    expect((await read({ productId: p.id, warehouseId: other.id })).movements.total).toBe(0);
  });
  it('counts distinct positive lots across warehouses for all five states, excludes zero balances and preserves SCRAPPED inconsistencies', async () => {
    const p = await createInventoryProduct(kit.prisma, { isLotTracked: true });
    const w = await createInventoryWarehouse(kit.prisma);
    const other = await createInventoryWarehouse(kit.prisma);
    for (const status of Object.values(LotStatus)) {
      const lot = await createInventoryLot(kit.prisma, p.id, status);
      for (const warehouseId of [w.id, other.id])
        await kit.prisma.inventoryMovement.create({
          data: {
            productId: p.id,
            warehouseId,
            lotId: lot.id,
            quantity: '10',
            type: 'ADJUSTMENT_IN',
            reason: 'INITIAL_LOAD',
            performedByUserId: actorId,
          },
        });
    }
    const zero = await createInventoryLot(kit.prisma, p.id, 'SCRAPPED');
    for (const quantity of ['10', '-10'])
      await kit.prisma.inventoryMovement.create({
        data: {
          productId: p.id,
          warehouseId: w.id,
          lotId: zero.id,
          quantity,
          type: quantity.startsWith('-') ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN',
          reason: 'CORRECTION',
          performedByUserId: actorId,
        },
      });
    for (const warehouseId of [w.id, other.id])
      await kit.prisma.stockBalance.create({
        data: { productId: p.id, warehouseId, quantity: '50' },
      });
    const d = await read({ productId: p.id });
    expect(d.lotsOnHand).toEqual({
      total: 5,
      quarantined: 1,
      released: 1,
      rejected: 1,
      rework: 1,
      scrapped: 1,
    });
    expect(d.stock).toMatchObject({ onHand: '100.0000', consumable: '20.0000' });
    const filtered = await read({ productId: p.id, warehouseId: w.id });
    expect(filtered.stock).toMatchObject({ onHand: '50.0000', consumable: '10.0000' });
    expect(filtered.lotsOnHand).toEqual(d.lotsOnHand);
  });
  it.each([
    ['2026-10-01', '2026-10-31', 'day', 31],
    ['2026-09-01', '2026-10-02', 'week', 5],
    ['2026-01-01', '2026-07-01', 'month', 7],
    ['2026-01-01', '2027-01-01', 'month', 13],
  ])('buckets %s to %s as %s', async (from, to, granularity, length) => {
    const d = await read({ from, to });
    expect(d.period.granularity).toBe(granularity);
    expect(d.movementsByPeriod).toHaveLength(length);
  });
  it('represents original quantity, partial output, rejection and actual SCRAP through the quality writer', async () => {
    const raw = await createInventoryProduct(kit.prisma);
    const w = await createInventoryWarehouse(kit.prisma);
    const post = (url: string) => kit.http().post(url).set('Cookie', cookie);
    await post('/api/inventory/adjustments')
      .send({
        productId: raw.id,
        warehouseId: w.id,
        type: 'ADJUSTMENT_IN',
        quantity: '125',
        reason: 'INITIAL_LOAD',
      })
      .expect(201);
    const output = await createInventoryProduct(kit.prisma, { isLotTracked: true });
    await kit.prisma.product.update({
      where: { id: output.id },
      data: { type: 'FINISHED_GOOD', requiresQualityInspection: true },
    });
    const bom = await kit.prisma.billOfMaterial.create({
      data: {
        productId: output.id,
        name: 'D2',
        versions: {
          create: {
            version: 1,
            outputQuantity: '1',
            isActive: true,
            createdByUserId: actorId,
            items: { create: { componentProductId: raw.id, quantity: '1' } },
          },
        },
      },
      include: { versions: true },
    });
    const response = await post('/api/production/orders')
      .send({
        productId: output.id,
        bomVersionId: bom.versions[0].id,
        warehouseId: w.id,
        quantityPlanned: '125',
      })
      .expect(201);
    const orderId = (response.body as { data: { id: string } }).data.id;
    await post(`/api/production/orders/${orderId}/start`).send({}).expect(200);
    const complete = await post(`/api/production/orders/${orderId}/complete`)
      .send({ quantityProduced: '125', allocations: [] })
      .expect(200);
    const lotId = (complete.body as { data: { lot: { id: string } } }).data.lot.id;
    // A partial physical adjustment is permitted on quarantined lots.
    await post('/api/inventory/adjustments')
      .send({
        productId: output.id,
        warehouseId: w.id,
        lotId,
        type: 'ADJUSTMENT_OUT',
        quantity: '25',
        reason: 'DAMAGE',
      })
      .expect(201);
    const before = await read({ productId: output.id });
    expect(before.stock).toMatchObject({ onHand: '100.0000', consumable: '0.0000' });
    await post(`/api/production/lots/${lotId}/inspection`)
      .send({ result: 'REJECTED', observations: 'Rechazo D2', nonConformities: 'Defecto' })
      .expect(201);
    await post(`/api/production/lots/${lotId}/disposition`)
      .send({ type: 'SCRAP', reason: 'Descarte D2' })
      .expect(201);
    const now = new Date().toISOString().slice(0, 10);
    const d = await read({
      productId: output.id,
      from: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      to: now,
    });
    expect(d.stock).toMatchObject({ onHand: '0.0000', consumable: '0.0000' });
    expect(d.lotsOnHand.total).toBe(0);
    expect(d.movements.byType.qualityScrap).toBe(1);
    expect(d.movementQuantity).toMatchObject({ in: '125.0000', out: '125.0000', net: '0.0000' });
    expect(d.recentMovements.find((m) => m.type === 'QUALITY_SCRAP')).toMatchObject({
      quantity: '-100.0000',
      businessReference: null,
    });
  });
});
