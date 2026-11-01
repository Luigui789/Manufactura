import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma, RoleCode } from '../src/generated/prisma/client.js';
import type { DashboardService } from '../src/purchases/dashboard/dashboard.service.js';
import { serializeOrder } from '../src/purchases/purchase-orders/purchase-order-mapping.js';
import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';
import { createInventoryProduct, createInventoryWarehouse } from './support/inventory-fixtures.js';

type Dashboard = Awaited<ReturnType<DashboardService['get']>>;
type Order = ReturnType<typeof serializeOrder>;
let kit: TestApp;
let cookie: string;
let reader: string;
let productId: string;
let warehouseId: string;
const endpoint = '/api/purchases/dashboard';
const base = '/api/purchase-orders';
const data = (r: { body: unknown }) => (r.body as { data: Order }).data;
const post = (path: string) => kit.http().post(path).set('Cookie', cookie);
async function supplier(isActive = true) {
  return kit.prisma.supplier.create({
    data: { code: `D3-${randomUUID()}`, name: 'Proveedor D3', isActive },
  });
}
async function read(supplierId?: string, filters: Record<string, string> = {}) {
  const params = new URLSearchParams({
    from: '2026-10-01',
    to: '2026-10-03',
    ...(supplierId ? { supplierId } : {}),
    ...filters,
  });
  const r = await kit.http().get(`${endpoint}?${params}`).set('Cookie', reader).expect(200);
  return (r.body as { data: Dashboard }).data;
}
async function order(
  supplierId: string,
  options: { at?: string; expectedDate?: string | null; price?: string; quantity?: string } = {},
) {
  const o = data(
    await post(base)
      .send({
        supplierId,
        expectedDate: options.expectedDate ?? null,
        items: [
          { productId, quantity: options.quantity ?? '10', unitPrice: options.price ?? '0.1005' },
        ],
      })
      .expect(201),
  );
  // Creation assigns the server clock; only timestamps are adjusted to exercise historical windows.
  await kit.prisma.purchaseOrder.update({
    where: { id: o.id },
    data: { orderedAt: new Date(options.at ?? '2026-10-02T12:00:00Z') },
  });
  return o;
}
async function confirm(o: Order) {
  return data(await post(`${base}/${o.id}/confirm`).send({}).expect(200));
}
async function receive(o: Order, quantity = '10', receivedAt = '2026-10-02T12:00:00Z') {
  return data(
    await post(`${base}/${o.id}/receive`)
      .send({ receivedAt, items: [{ purchaseOrderItemId: o.items[0].id, warehouseId, quantity }] })
      .expect(201),
  );
}
beforeAll(async () => {
  kit = await createTestApp();
  cookie = await login(kit, await createUser(kit, RoleCode.COMPRAS));
  reader = await login(kit, await createUser(kit, RoleCode.VENTAS));
  productId = (await createInventoryProduct(kit.prisma)).id;
  warehouseId = (await createInventoryWarehouse(kit.prisma)).id;
}, 30000);
afterAll(async () => {
  await kit?.close();
});

describe('Purchases dashboard PostgreSQL', () => {
  it('requires authentication', async () => {
    await kit.http().get(endpoint).expect(401);
  });
  it.each([
    'from=2026-02-30',
    'to=2026-13-01',
    'from=0000-01-01',
    'from=2026-1-01',
    'from=no',
    'from=2026-10-01T00:00:00Z',
    'from=2026-10-03&to=2026-10-01',
    'from=2025-01-01&to=2026-01-02',
    'supplierId=invalid',
    'supplierId[]=invalid',
  ])('rejects invalid filters %s', async (q) => {
    await kit.http().get(`${endpoint}?${q}`).set('Cookie', reader).expect(400);
  });
  it('returns 404 for a missing supplier', async () => {
    await kit
      .http()
      .get(`${endpoint}?supplierId=${randomUUID()}`)
      .set('Cookie', reader)
      .expect(404);
  });
  it('defaults to 30 Managua calendar days including today', async () => {
    const r = await kit.http().get(endpoint).set('Cookie', reader).expect(200);
    const d = (r.body as { data: Dashboard }).data;
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Managua',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value]),
    );
    expect(d.period.to).toBe(`${parts.year}-${parts.month}-${parts.day}`);
    expect((Date.parse(d.period.to) - Date.parse(d.period.from)) / 86400000 + 1).toBe(30);
    expect(d.period.timeZone).toBe('America/Managua');
  });
  it('permits an inactive supplier without activity and returns zero metrics', async () => {
    const s = await supplier(false);
    const d = await read(s.id);
    expect(d.selectedSupplier).toEqual({ id: s.id, code: s.code, name: s.name });
    expect(d.orders).toEqual({
      total: 0,
      draft: 0,
      confirmed: 0,
      partiallyReceived: 0,
      received: 0,
      cancelled: 0,
    });
    expect(d.pipeline).toEqual({ awaitingReceipt: 0, overdue: 0 });
    expect(d.amounts.committed).toBe('0.00');
    expect(d.suppliers.usedInPeriod).toBe(0);
    expect(d.receipts).toEqual({ total: 0, lines: 0 });
    expect(d.topSuppliers).toEqual([]);
    expect(d.recentOrders).toEqual([]);
    expect(d.activityByPeriod).toHaveLength(3);
    expect(d.activityByPeriod.every((p) => p.orders === 0 && p.receipts === 0)).toBe(true);
  });
  it('counts active suppliers globally independently of dates and supplier filter', async () => {
    const before = await read();
    const s = await supplier();
    await supplier(false);
    const after = await read(s.id, { from: '2000-01-01', to: '2000-01-01' });
    expect(after.suppliers.active).toBe(before.suppliers.active + 1);
  });
  it('returns an empty historical period without changing global active suppliers', async () => {
    const d = await read(undefined, { from: '0001-01-01', to: '0001-01-01' });
    expect(d.orders.total).toBe(0);
    expect(d.receipts.total).toBe(0);
    expect(d.amounts.committed).toBe('0.00');
    expect(d.activityByPeriod).toEqual([{ period: '0001-01-01', orders: 0, receipts: 0 }]);
  });
  it('counts all five states, distinct suppliers and stored committed decimals without drafts/cancellations', async () => {
    const s = await supplier();
    await order(s.id, { price: '999' });
    await confirm(await order(s.id));
    await receive(await confirm(await order(s.id)), '4');
    await receive(await confirm(await order(s.id)));
    const cancelled = await order(s.id, { price: '888' });
    await post(`${base}/${cancelled.id}/cancel`).send({}).expect(200);
    await order((await supplier()).id);
    await confirm(await order(s.id, { at: '2026-09-30T12:00:00Z', price: '777' }));
    const d = await read(s.id);
    expect(d.orders).toEqual({
      total: 5,
      draft: 1,
      confirmed: 1,
      partiallyReceived: 1,
      received: 1,
      cancelled: 1,
    });
    expect(d.suppliers.usedInPeriod).toBe(1);
    expect(d.amounts.committed).toBe('3.03');
    expect(d.pipeline.awaitingReceipt).toBe(3);
    expect(d.receipts).toEqual({ total: 2, lines: 2 });
    expect(d.topSuppliers).toEqual([
      { supplier: { id: s.id, code: s.code, name: s.name }, orders: 5, committedAmount: '3.03' },
    ]);
    expect(d.recentOrders).toHaveLength(5);
    expect(d.recentOrders.every((o) => o.supplier.id === s.id)).toBe(true);
  });
  it('follows real draft → confirmed → partial → received transitions without moving order membership', async () => {
    const s = await supplier();
    const o = await order(s.id, { expectedDate: '2000-01-01' });
    expect((await read(s.id)).pipeline.awaitingReceipt).toBe(0);
    await confirm(o);
    let d = await read(s.id);
    expect(d.pipeline).toEqual({ awaitingReceipt: 1, overdue: 1 });
    expect(d.orders.confirmed).toBe(1);
    await receive(o, '4', '2026-10-03T18:00:00Z');
    d = await read(s.id);
    expect(d.orders.partiallyReceived).toBe(1);
    expect(d.pipeline.overdue).toBe(1);
    expect(d.receipts.total).toBe(1);
    await receive(o, '6', '2026-11-03T18:00:00Z');
    d = await read(s.id);
    expect(d.orders.received).toBe(1);
    expect(d.pipeline).toEqual({ awaitingReceipt: 0, overdue: 0 });
    expect(d.receipts.total).toBe(1);
    expect(d.amounts.committed).toBe('1.01');
    expect((await read(s.id, { from: '2026-11-03', to: '2026-11-03' })).receipts.total).toBe(1);
    expect((await read(s.id, { from: '2026-11-03', to: '2026-11-03' })).orders.total).toBe(0);
  });
  it('overdue excludes today, future, null, draft, cancelled and received; pipeline ignores range', async () => {
    const s = await supplier();
    const today = (await kit.http().get(endpoint).set('Cookie', reader)).body as {
      data: Dashboard;
    };
    for (const expectedDate of ['2000-01-01', today.data.period.to, '9999-12-31', null])
      await confirm(await order(s.id, { expectedDate }));
    await order(s.id, { expectedDate: '2000-01-01' });
    const cancelled = await order(s.id, { expectedDate: '2000-01-01' });
    await post(`${base}/${cancelled.id}/cancel`).send({}).expect(200);
    await receive(await confirm(await order(s.id, { expectedDate: '2000-01-01' })));
    const a = await read(s.id);
    const b = await read(s.id, { from: '2000-01-01', to: '2000-01-01' });
    expect(a.pipeline).toEqual({ awaitingReceipt: 4, overdue: 1 });
    expect(b.pipeline).toEqual(a.pipeline);
    expect(b.orders.total).toBe(0);
  });
  it('uses exact Managua boundaries for both event clocks including microseconds', async () => {
    const s = await supplier();
    const times = [
      '2026-10-01T05:59:59.999Z',
      '2026-10-01T06:00:00.000Z',
      '2026-10-02T05:59:59.999Z',
      '2026-10-02T06:00:00.000Z',
    ];
    for (const at of times) await receive(await confirm(await order(s.id, { at })), '10', at);
    const last = await order(s.id);
    await kit.prisma
      .$executeRaw`UPDATE purchase_orders SET ordered_at = '2026-10-02 05:59:59.999999+00'::timestamptz WHERE id = ${last.id}::uuid`;
    const d = await read(s.id, { from: '2026-10-01', to: '2026-10-01' });
    expect(d.orders.total).toBe(3);
    expect(d.receipts.total).toBe(2);
    expect(d.activityByPeriod).toEqual([{ period: '2026-10-01', orders: 3, receipts: 2 }]);
  });
  it('counts receipt lines across incompatible units without exposing aggregate quantities or invented values', async () => {
    const s = await supplier();
    const other = await createInventoryProduct(kit.prisma);
    await kit.prisma.product.update({
      where: { id: other.id },
      data: { type: 'CONSUMABLE', unit: 'MILLILITER' },
    });
    const o = data(
      await post(base)
        .send({
          supplierId: s.id,
          items: [
            { productId, quantity: '5', unitPrice: '0.10' },
            { productId: other.id, quantity: '5000', unitPrice: '0.01' },
          ],
        })
        .expect(201),
    );
    await confirm(o);
    await post(`${base}/${o.id}/receive`)
      .send({
        receivedAt: '2026-10-02T18:00:00Z',
        items: o.items.map((i) => ({
          purchaseOrderItemId: i.id,
          warehouseId,
          quantity: i.quantityOrdered,
        })),
      })
      .expect(201);
    const d = await read(s.id);
    expect(d.receipts).toEqual({ total: 1, lines: 2 });
    expect(Object.keys(d.amounts)).toEqual(['committed']);
    expect(Object.keys(d.receipts)).toEqual(['total', 'lines']);
    expect(JSON.stringify(d)).not.toMatch(/totalQuantity|receivedValue|pendingValue|currency/);
  });
  it.each([
    ['2026-01-01', '2026-01-31', 'day', 31],
    ['2026-01-01', '2026-02-01', 'week', 5],
    ['2026-01-01', '2026-06-29', 'week', 27],
    ['2026-01-01', '2026-06-30', 'month', 6],
    ['2024-01-01', '2024-12-31', 'month', 12],
  ])('fills zero %s–%s buckets with %s granularity', async (from, to, granularity, length) => {
    const s = await supplier(false);
    const d = await read(s.id, { from: String(from), to: String(to) });
    expect(d.period.granularity).toBe(granularity);
    expect(d.activityByPeriod).toHaveLength(Number(length));
    expect(d.activityByPeriod.every((p) => !p.orders && !p.receipts)).toBe(true);
  });
  it('sorts and limits recent orders deterministically and returns a usable detail id', async () => {
    const s = await supplier();
    const created = [];
    for (let i = 0; i < 7; i++) created.push(await order(s.id, { at: `2026-10-02T12:0${i}:00Z` }));
    const d = await read(s.id);
    expect(d.recentOrders.map((o) => o.id)).toEqual(
      created
        .slice(2)
        .reverse()
        .map((o) => o.id),
    );
    await kit.http().get(`${base}/${d.recentOrders[0].id}`).set('Cookie', reader).expect(200);
    expect(d.recentOrders[0]).toMatchObject({
      expectedDate: null,
      total: '1.01',
      itemsCount: 1,
      receiptsCount: 0,
    });
    await kit.prisma.purchaseOrder.updateMany({
      where: { supplierId: s.id },
      data: {
        orderedAt: new Date('2026-10-02T12:00:00Z'),
        createdAt: new Date('2026-10-02T12:00:00Z'),
      },
    });
    expect((await read(s.id)).recentOrders.map((o) => o.id)).toEqual(
      created
        .map((o) => o.id)
        .sort()
        .reverse()
        .slice(0, 5),
    );
  });
  it('ranks top five by committed decimal amount then order count and code', async () => {
    const before = await read(undefined, { from: '1900-01-01', to: '1900-01-03' });
    const ids: string[] = [];
    const candidates = [...before.topSuppliers];
    for (let i = 0; i < 6; i++) {
      const s = await supplier();
      ids.push(s.id);
      await confirm(await order(s.id, { at: '1900-01-02T12:00:00Z', price: String(i + 1) }));
      await order(s.id, { at: '1900-01-02T12:00:00Z', price: '9999' });
      candidates.push({
        supplier: { id: s.id, code: s.code, name: s.name },
        orders: 2,
        committedAmount: `${(i + 1) * 10}.00`,
      });
    }
    const d = await read(undefined, { from: '1900-01-01', to: '1900-01-03' });
    candidates.sort(
      (a, b) =>
        new Prisma.Decimal(b.committedAmount).cmp(a.committedAmount) ||
        b.orders - a.orders ||
        a.supplier.code.localeCompare(b.supplier.code),
    );
    expect(d.topSuppliers.map((s) => s.supplier.id)).toEqual(
      candidates.slice(0, 5).map((s) => s.supplier.id),
    );
    expect(d.topSuppliers[0]).toMatchObject({ orders: 2, committedAmount: '60.00' });
    expect(d.suppliers.usedInPeriod).toBe(before.suppliers.usedInPeriod + ids.length);
    expect(d.amounts.committed).toBe(
      new Prisma.Decimal(before.amounts.committed).add('210.00').toFixed(2),
    );
  });
  it('returns zero current active suppliers for an empty active catalog', async () => {
    const active = await kit.prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const ids = active.map((s) => s.id);
    try {
      await kit.prisma.supplier.updateMany({
        where: { id: { in: ids } },
        data: { isActive: false },
      });
      expect((await read()).suppliers.active).toBe(0);
    } finally {
      await kit.prisma.supplier.updateMany({
        where: { id: { in: ids } },
        data: { isActive: true },
      });
    }
  });
  it('aggregates large persisted line totals with exact decimal cents', async () => {
    const s = await supplier();
    for (let i = 0; i < 3; i++)
      await confirm(await order(s.id, { quantity: '100', price: '9999999999.9999' }));
    expect((await read(s.id)).amounts.committed).toBe('2999999999999.97');
  });
  it.each([
    ['2026-01-01', '2026-02-01', '2025-12-29'],
    ['2026-01-01', '2026-12-31', '2026-01-01'],
  ])('groups real activity using %s to %s calendar buckets', async (from, to, firstBucket) => {
    const s = await supplier();
    await receive(
      await confirm(await order(s.id, { at: '2026-01-01T06:00:00Z' })),
      '10',
      '2026-01-01T06:00:00Z',
    );
    const d = await read(s.id, { from, to });
    expect(d.activityByPeriod[0]).toEqual({ period: firstBucket, orders: 1, receipts: 1 });
    expect(d.activityByPeriod.slice(1).every((p) => !p.orders && !p.receipts)).toBe(true);
  });
  it('retains receipt activity for an order emitted before the selected period', async () => {
    const s = await supplier();
    await receive(await confirm(await order(s.id, { at: '2026-09-01T12:00:00Z' })));
    const d = await read(s.id);
    expect(d.orders.total).toBe(0);
    expect(d.amounts.committed).toBe('0.00');
    expect(d.receipts.total).toBe(1);
    expect(d.suppliers.usedInPeriod).toBe(0);
  });
  it('keeps historical orders and receipts visible after deactivating their supplier', async () => {
    const s = await supplier();
    await receive(await confirm(await order(s.id)));
    await kit.prisma.supplier.update({ where: { id: s.id }, data: { isActive: false } });
    const d = await read(s.id);
    expect(d.orders.received).toBe(1);
    expect(d.receipts.total).toBe(1);
    expect(d.amounts.committed).toBe('1.01');
  });
});
