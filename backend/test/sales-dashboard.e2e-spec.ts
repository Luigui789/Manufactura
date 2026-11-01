import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Prisma, RoleCode } from '../src/generated/prisma/client.js';
import type { DashboardService } from '../src/sales/dashboard/dashboard.service.js';
import type { SalesOrdersService } from '../src/sales/sales-orders/sales-orders.service.js';
import { InventoryService } from '../src/inventory/movements/inventory.service.js';
import {
  createTestApp,
  createUser,
  login,
  type TestApp,
  type TestUser,
} from './support/auth-test-kit.js';
import { createInventoryProduct, createInventoryWarehouse } from './support/inventory-fixtures.js';

type Dashboard = Awaited<ReturnType<DashboardService['get']>>;
type Order = Awaited<ReturnType<SalesOrdersService['get']>>;
let kit: TestApp;
let cookie: string;
let reader: string;
let productId: string;
let warehouseId: string;
let actor: TestUser;
const endpoint = '/api/sales/dashboard';
const base = '/api/sales/orders';
const data = (r: { body: unknown }) => (r.body as { data: Order }).data;
const post = (path: string) => kit.http().post(path).set('Cookie', cookie);
async function customer(isActive = true) {
  return kit.prisma.customer.create({
    data: { code: `D4-${randomUUID()}`, name: 'Cliente D4', isActive },
  });
}
async function read(customerId?: string, filters: Record<string, string> = {}) {
  const params = new URLSearchParams({
    from: '2026-10-01',
    to: '2026-10-03',
    ...(customerId ? { customerId } : {}),
    ...filters,
  });
  const r = await kit.http().get(`${endpoint}?${params}`).set('Cookie', reader).expect(200);
  return (r.body as { data: Dashboard }).data;
}
async function order(
  customerId: string,
  options: { at?: string; price?: string; quantity?: string } = {},
) {
  const o = data(
    await post(base)
      .send({
        customerId,
        items: [
          { productId, quantity: options.quantity ?? '10', unitPrice: options.price ?? '0.1005' },
        ],
      })
      .expect(201),
  );
  // Creation assigns the server clock; only timestamps are adjusted to exercise historical windows.
  await kit.prisma.saleOrder.update({
    where: { id: o.id },
    data: { orderedAt: new Date(options.at ?? '2026-10-02T12:00:00Z') },
  });
  return o;
}
async function confirm(o: Order) {
  return data(await post(`${base}/${o.id}/confirm`).send({}).expect(200));
}
async function dispatch(o: Order, quantity = '10', dispatchedAt = '2026-10-02T12:00:00Z') {
  return dispatchItems(
    o,
    [{ saleOrderItemId: o.items[0].id, warehouseId, quantity }],
    dispatchedAt,
  );
}
async function dispatchItems(
  o: Order,
  items: { saleOrderItemId: string; warehouseId: string; quantity: string }[],
  at: string,
) {
  // Dispatch documents are immutable in PostgreSQL. Control only the server Date clock;
  // keep real timers, auth, writers, inventory, audit and every database trigger enabled.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(at));
  try {
    const historicalSession = await login(kit, actor);
    await kit
      .http()
      .post(`${base}/${o.id}/dispatch`)
      .set('Cookie', historicalSession)
      .send({ items })
      .expect(200);
  } finally {
    vi.useRealTimers();
  }
}
beforeAll(async () => {
  kit = await createTestApp();
  actor = await createUser(kit, RoleCode.VENTAS);
  cookie = await login(kit, actor);
  reader = await login(kit, await createUser(kit, RoleCode.COMPRAS));
  const product = await createInventoryProduct(kit.prisma);
  productId = product.id;
  await kit.prisma.product.update({ where: { id: productId }, data: { type: 'FINISHED_GOOD' } });
  warehouseId = (await createInventoryWarehouse(kit.prisma)).id;
  await kit.prisma.$transaction((tx) =>
    kit.app.get(InventoryService).applyMovements(tx, {
      performedByUserId: actor.id,
      lines: [
        {
          type: 'ADJUSTMENT_IN',
          productId,
          warehouseId,
          quantity: '1000000',
          origin: { kind: 'ADJUSTMENT', reason: 'INITIAL_LOAD' },
        },
      ],
    }),
  );
}, 30000);
afterAll(async () => {
  await kit?.close();
});

describe('Sales dashboard PostgreSQL', () => {
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
    'customerId=invalid',
    'customerId[]=invalid',
  ])('rejects invalid filters %s', async (q) => {
    await kit.http().get(`${endpoint}?${q}`).set('Cookie', reader).expect(400);
  });
  it('returns 404 for a missing customer', async () => {
    await kit
      .http()
      .get(`${endpoint}?customerId=${randomUUID()}`)
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
  it('permits an inactive customer without activity and returns zero metrics', async () => {
    const s = await customer(false);
    const d = await read(s.id);
    expect(d.selectedCustomer).toEqual({ id: s.id, code: s.code, name: s.name });
    expect(d.orders).toEqual({
      total: 0,
      draft: 0,
      confirmed: 0,
      partiallyDispatched: 0,
      dispatched: 0,
      cancelled: 0,
    });
    expect(d.pipeline).toEqual({ awaitingDispatch: 0 });
    expect(d.amounts.confirmed).toBe('0.00');
    expect(d.customers.usedInPeriod).toBe(0);
    expect(d.dispatches).toEqual({ total: 0, lines: 0 });
    expect(d.topCustomers).toEqual([]);
    expect(d.recentOrders).toEqual([]);
    expect(d.activityByPeriod).toHaveLength(3);
    expect(d.activityByPeriod.every((p) => p.orders === 0 && p.dispatches === 0)).toBe(true);
  });
  it('counts active customers globally independently of dates and customer filter', async () => {
    const before = await read();
    const s = await customer();
    await customer(false);
    const after = await read(s.id, { from: '2000-01-01', to: '2000-01-01' });
    expect(after.customers.active).toBe(before.customers.active + 1);
  });
  it('returns an empty historical period without changing global active customers', async () => {
    const d = await read(undefined, { from: '0001-01-01', to: '0001-01-01' });
    expect(d.orders.total).toBe(0);
    expect(d.dispatches.total).toBe(0);
    expect(d.amounts.confirmed).toBe('0.00');
    expect(d.activityByPeriod).toEqual([{ period: '0001-01-01', orders: 0, dispatches: 0 }]);
  });
  it('counts all five states, distinct customers and stored confirmed decimals without drafts/cancellations', async () => {
    const s = await customer();
    await order(s.id, { price: '999' });
    await confirm(await order(s.id));
    await dispatch(await confirm(await order(s.id)), '4');
    await dispatch(await confirm(await order(s.id)));
    const cancelled = await order(s.id, { price: '888' });
    await post(`${base}/${cancelled.id}/cancel`).send({}).expect(200);
    await order((await customer()).id);
    await confirm(await order(s.id, { at: '2026-09-30T12:00:00Z', price: '777' }));
    const d = await read(s.id);
    expect(d.orders).toEqual({
      total: 5,
      draft: 1,
      confirmed: 1,
      partiallyDispatched: 1,
      dispatched: 1,
      cancelled: 1,
    });
    expect(d.customers.usedInPeriod).toBe(1);
    expect(d.amounts.confirmed).toBe('3.03');
    expect(d.pipeline.awaitingDispatch).toBe(3);
    expect(d.dispatches).toEqual({ total: 2, lines: 2 });
    expect(d.topCustomers).toEqual([
      { customer: { id: s.id, code: s.code, name: s.name }, orders: 5, confirmedAmount: '3.03' },
    ]);
    expect(d.recentOrders).toHaveLength(5);
    expect(d.recentOrders.every((o) => o.customer.id === s.id)).toBe(true);
  });
  it('follows real draft → confirmed → partial → dispatched transitions without moving order membership', async () => {
    const s = await customer();
    const o = await order(s.id);
    const assertFlow = async (
      state: 'draft' | 'confirmed' | 'partiallyDispatched' | 'dispatched',
      pending: number,
      dispatches: number,
      value: string,
    ) => {
      const d = await read(s.id);
      expect(d.pipeline.awaitingDispatch).toBe(pending);
      expect(d.orders).toEqual({
        total: 1,
        draft: 0,
        confirmed: 0,
        partiallyDispatched: 0,
        dispatched: 0,
        cancelled: 0,
        [state]: 1,
      });
      expect(d.dispatches).toEqual({ total: dispatches, lines: dispatches });
      expect(d.amounts.confirmed).toBe(value);
    };
    await assertFlow('draft', 0, 0, '0.00');
    await confirm(o);
    await assertFlow('confirmed', 1, 0, '1.01');
    await dispatch(o, '4', '2026-10-03T18:00:00Z');
    await assertFlow('partiallyDispatched', 1, 1, '1.01');
    await dispatch(o, '6', '2026-10-03T19:00:00Z');
    await assertFlow('dispatched', 0, 2, '1.01');
    const movements = await kit.prisma.inventoryMovement.findMany({
      where: { saleDispatchItem: { saleOrderId: o.id } },
      select: { quantity: true, type: true },
    });
    expect(movements).toHaveLength(2);
    expect(movements.every((m) => m.type === 'SALE_DISPATCH')).toBe(true);
    expect(
      movements.reduce((sum, m) => sum.add(m.quantity), new Prisma.Decimal(0)).toFixed(4),
    ).toBe('-10.0000');
  });
  it('keeps the current pipeline independent of the selected period', async () => {
    const s = await customer();
    await confirm(await order(s.id));
    await dispatch(await confirm(await order(s.id)), '4');
    const current = await read(s.id);
    const old = await read(s.id, { from: '2000-01-01', to: '2000-01-01' });
    expect(current.pipeline).toEqual({ awaitingDispatch: 2 });
    expect(old.pipeline).toEqual(current.pipeline);
    expect(old.orders.total).toBe(0);
  });
  it('uses exact Managua boundaries for both event clocks including microseconds', async () => {
    const s = await customer();
    const times = [
      '2026-10-01T05:59:59.999Z',
      '2026-10-01T06:00:00.000Z',
      '2026-10-02T05:59:59.999Z',
      '2026-10-02T06:00:00.000Z',
    ];
    for (const at of times) await dispatch(await confirm(await order(s.id, { at })), '10', at);
    const last = await order(s.id);
    await kit.prisma
      .$executeRaw`UPDATE sale_orders SET ordered_at = '2026-10-02 05:59:59.999999+00'::timestamptz WHERE id = ${last.id}::uuid`;
    const d = await read(s.id, { from: '2026-10-01', to: '2026-10-01' });
    expect(d.orders.total).toBe(3);
    expect(d.dispatches.total).toBe(2);
    expect(d.activityByPeriod).toEqual([{ period: '2026-10-01', orders: 3, dispatches: 2 }]);
  });
  it('counts dispatch lines across incompatible units without exposing aggregate quantities or invented values', async () => {
    const s = await customer();
    const other = await createInventoryProduct(kit.prisma);
    await kit.prisma.product.update({
      where: { id: other.id },
      data: { type: 'FINISHED_GOOD', unit: 'MILLILITER' },
    });
    const o = data(
      await post(base)
        .send({
          customerId: s.id,
          items: [
            { productId, quantity: '5', unitPrice: '0.10' },
            { productId: other.id, quantity: '5000', unitPrice: '0.01' },
          ],
        })
        .expect(201),
    );
    await kit.prisma.$transaction((tx) =>
      kit.app.get(InventoryService).applyMovements(tx, {
        performedByUserId: actor.id,
        lines: [
          {
            type: 'ADJUSTMENT_IN',
            productId: other.id,
            warehouseId,
            quantity: '5000',
            origin: { kind: 'ADJUSTMENT', reason: 'INITIAL_LOAD' },
          },
        ],
      }),
    );
    await confirm(o);
    await dispatchItems(
      o,
      o.items.map((i) => ({
        saleOrderItemId: i.id,
        warehouseId,
        quantity: i.quantity,
      })),
      '2026-10-02T18:00:00Z',
    );
    const d = await read(s.id);
    expect(d.dispatches).toEqual({ total: 1, lines: 2 });
    expect(Object.keys(d.amounts)).toEqual(['confirmed']);
    expect(Object.keys(d.dispatches)).toEqual(['total', 'lines']);
    expect(Object.keys(d.pipeline)).toEqual(['awaitingDispatch']);
    expect(JSON.stringify(d)).not.toMatch(
      /totalQuantity|dispatchedValue|pendingValue|currency|revenue|overdue|reservedStock/,
    );
  });
  it.each([
    ['2026-01-01', '2026-01-31', 'day', 31],
    ['2026-01-01', '2026-02-01', 'week', 5],
    ['2026-01-01', '2026-06-29', 'week', 27],
    ['2026-01-01', '2026-06-30', 'month', 6],
    ['2024-01-01', '2024-12-31', 'month', 12],
  ])('fills zero %s–%s buckets with %s granularity', async (from, to, granularity, length) => {
    const s = await customer(false);
    const d = await read(s.id, { from: String(from), to: String(to) });
    expect(d.period.granularity).toBe(granularity);
    expect(d.activityByPeriod).toHaveLength(Number(length));
    expect(d.activityByPeriod.every((p) => !p.orders && !p.dispatches)).toBe(true);
  });
  it('sorts and limits recent orders deterministically and returns a usable detail id', async () => {
    const s = await customer();
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
      total: '1.01',
      itemsCount: 1,
      dispatchesCount: 0,
    });
    await kit.prisma.saleOrder.updateMany({
      where: { customerId: s.id },
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
  it('ranks top five by confirmed decimal amount then order count and code', async () => {
    const before = await read(undefined, { from: '1900-01-01', to: '1900-01-03' });
    const ids: string[] = [];
    const candidates = [...before.topCustomers];
    for (let i = 0; i < 6; i++) {
      const s = await customer();
      ids.push(s.id);
      await confirm(await order(s.id, { at: '1900-01-02T12:00:00Z', price: String(i + 1) }));
      await order(s.id, { at: '1900-01-02T12:00:00Z', price: '9999' });
      candidates.push({
        customer: { id: s.id, code: s.code, name: s.name },
        orders: 2,
        confirmedAmount: `${(i + 1) * 10}.00`,
      });
    }
    const d = await read(undefined, { from: '1900-01-01', to: '1900-01-03' });
    candidates.sort(
      (a, b) =>
        new Prisma.Decimal(b.confirmedAmount).cmp(a.confirmedAmount) ||
        b.orders - a.orders ||
        a.customer.code.localeCompare(b.customer.code),
    );
    expect(d.topCustomers.map((s) => s.customer.id)).toEqual(
      candidates.slice(0, 5).map((s) => s.customer.id),
    );
    expect(d.topCustomers[0]).toMatchObject({ orders: 2, confirmedAmount: '60.00' });
    expect(d.customers.usedInPeriod).toBe(before.customers.usedInPeriod + ids.length);
    expect(d.amounts.confirmed).toBe(
      new Prisma.Decimal(before.amounts.confirmed).add('210.00').toFixed(2),
    );
  });
  it('returns zero current active customers for an empty active catalog', async () => {
    const active = await kit.prisma.customer.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const ids = active.map((s) => s.id);
    try {
      await kit.prisma.customer.updateMany({
        where: { id: { in: ids } },
        data: { isActive: false },
      });
      expect((await read()).customers.active).toBe(0);
    } finally {
      await kit.prisma.customer.updateMany({
        where: { id: { in: ids } },
        data: { isActive: true },
      });
    }
  });
  it('breaks equal amount ties by order count then customer code', async () => {
    const filters = { from: '1801-01-01', to: '1801-01-02' };
    const candidates = [...(await read(undefined, filters)).topCustomers];
    const suffix = randomUUID();
    for (const code of ['C', 'B', 'A']) {
      const s = await kit.prisma.customer.create({
        data: { code: `D4-${code}-${suffix}`, name: `Tie ${code}` },
      });
      await confirm(await order(s.id, { at: '1801-01-01T12:00:00Z', price: '1' }));
      if (code === 'B') await order(s.id, { at: '1801-01-01T12:00:00Z' });
      candidates.push({
        customer: { id: s.id, code: s.code, name: s.name },
        orders: code === 'B' ? 2 : 1,
        confirmedAmount: '10.00',
      });
    }
    candidates.sort(
      (a, b) =>
        new Prisma.Decimal(b.confirmedAmount).cmp(a.confirmedAmount) ||
        b.orders - a.orders ||
        a.customer.code.localeCompare(b.customer.code) ||
        a.customer.id.localeCompare(b.customer.id),
    );
    expect((await read(undefined, filters)).topCustomers).toEqual(candidates.slice(0, 5));
  });
  it('aggregates large persisted line totals with exact decimal cents', async () => {
    const s = await customer();
    for (let i = 0; i < 3; i++)
      await confirm(await order(s.id, { quantity: '100', price: '9999999999.9999' }));
    expect((await read(s.id)).amounts.confirmed).toBe('2999999999999.97');
  });
  it.each([
    ['2026-01-01', '2026-02-01', '2025-12-29'],
    ['2026-01-01', '2026-12-31', '2026-01-01'],
  ])('groups real activity using %s to %s calendar buckets', async (from, to, firstBucket) => {
    const s = await customer();
    await dispatch(
      await confirm(await order(s.id, { at: '2026-01-01T06:00:00Z' })),
      '10',
      '2026-01-01T06:00:00Z',
    );
    const d = await read(s.id, { from, to });
    expect(d.activityByPeriod[0]).toEqual({ period: firstBucket, orders: 1, dispatches: 1 });
    expect(d.activityByPeriod.slice(1).every((p) => !p.orders && !p.dispatches)).toBe(true);
  });
  it('retains dispatch activity for an order emitted before the selected period', async () => {
    const s = await customer();
    await dispatch(await confirm(await order(s.id, { at: '2026-09-01T12:00:00Z' })));
    const d = await read(s.id);
    expect(d.orders.total).toBe(0);
    expect(d.amounts.confirmed).toBe('0.00');
    expect(d.dispatches.total).toBe(1);
    expect(d.customers.usedInPeriod).toBe(0);
  });
  it('keeps historical orders and dispatches visible after deactivating their customer', async () => {
    const s = await customer();
    await dispatch(await confirm(await order(s.id)));
    await kit.prisma.customer.update({ where: { id: s.id }, data: { isActive: false } });
    const d = await read(s.id);
    expect(d.orders.dispatched).toBe(1);
    expect(d.dispatches.total).toBe(1);
    expect(d.amounts.confirmed).toBe('1.01');
  });
});
