import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ProductType,
  ProductionOrderStatus,
  RoleCode,
  UnitOfMeasure,
} from '../src/generated/prisma/client.js';
import {
  createTestApp,
  createUser,
  login,
  type TestApp,
  type TestUser,
} from './support/auth-test-kit.js';
import { createInventoryProduct, createInventoryWarehouse } from './support/inventory-fixtures.js';

const endpoint = '/api/production/dashboard';
let kit: TestApp;
let actor: TestUser;
let cookie: string;
let product: Awaited<ReturnType<typeof createInventoryProduct>>;
let warehouse: Awaited<ReturnType<typeof createInventoryWarehouse>>;
let versionId: string;

function data<T>(response: { body: unknown }): T {
  return (response.body as { data: T }).data;
}

beforeAll(async () => {
  kit = await createTestApp();
  // Repeated local/CI runs may reuse the same *_test database.
  await kit.prisma.productionOrder.deleteMany({ where: { number: { startsWith: 'DASH-' } } });
  actor = await createUser(kit, RoleCode.PRODUCCION);
  cookie = await login(kit, actor);
  const rawProduct = await createInventoryProduct(kit.prisma);
  product = await kit.prisma.product.update({
    where: { id: rawProduct.id },
    data: { type: ProductType.FINISHED_GOOD, unit: UnitOfMeasure.UNIT },
  });
  warehouse = await createInventoryWarehouse(kit.prisma);
  const bom = await kit.prisma.billOfMaterial.create({
    data: { productId: product.id, name: `Dashboard ${product.code}` },
  });
  const version = await kit.prisma.bomVersion.create({
    data: {
      bomId: bom.id,
      version: 1,
      outputQuantity: '1',
      isActive: true,
      createdByUserId: actor.id,
    },
  });
  versionId = version.id;
}, 30000);

afterAll(async () => {
  if (kit) {
    await kit.prisma.productionOrder.deleteMany({ where: { number: { startsWith: 'DASH-' } } });
    await kit.close();
  }
});

async function createOrder(options: {
  number: string;
  status: ProductionOrderStatus;
  planned: string;
  produced: string;
  activityDate: string;
}) {
  const instant = new Date(`${options.activityDate}T12:00:00-06:00`);
  return kit.prisma.productionOrder.create({
    data: {
      number: options.number,
      productId: product.id,
      bomVersionId: versionId,
      warehouseId: warehouse.id,
      createdByUserId: actor.id,
      status: options.status,
      quantityPlanned: options.planned,
      quantityProduced: options.produced,
      plannedStartAt: options.status === ProductionOrderStatus.DRAFT ? instant : null,
      startedAt:
        options.status === ProductionOrderStatus.IN_PROGRESS ||
        options.status === ProductionOrderStatus.COMPLETED
          ? instant
          : null,
      completedAt: options.status === ProductionOrderStatus.COMPLETED ? instant : null,
      createdAt: instant,
      updatedAt: instant,
    },
  });
}

describe('GET /api/production/dashboard', () => {
  it('requires a valid session', async () => {
    await kit.http().get(endpoint).expect(401);
  });

  it('validates ISO dates, order and bounded ranges', async () => {
    const get = (query: string) =>
      kit
        .http()
        .get(endpoint + query)
        .set('Cookie', cookie);
    await get('?from=2026-02-30').expect(400);
    await get('?from=2026-10-20&to=2026-10-01').expect(400);
    await get('?from=2025-01-01&to=2026-10-01').expect(400);
    await get('?to=not-a-date').expect(400);
  });

  it('aggregates states and decimal quantities, groups the series, and lists recent orders', async () => {
    await Promise.all([
      createOrder({
        number: `DASH-${product.code}-D`,
        status: ProductionOrderStatus.DRAFT,
        planned: '1.2500',
        produced: '0',
        activityDate: '2026-10-01',
      }),
      createOrder({
        number: `DASH-${product.code}-I`,
        status: ProductionOrderStatus.IN_PROGRESS,
        planned: '4.0000',
        produced: '0.0000',
        activityDate: '2026-10-02',
      }),
      createOrder({
        number: `DASH-${product.code}-C`,
        status: ProductionOrderStatus.COMPLETED,
        planned: '6.2500',
        produced: '6.2500',
        activityDate: '2026-10-03',
      }),
      createOrder({
        number: `DASH-${product.code}-X`,
        status: ProductionOrderStatus.CANCELLED,
        planned: '1.0000',
        produced: '0',
        activityDate: '2026-10-04',
      }),
      createOrder({
        number: `DASH-${product.code}-OUTSIDE`,
        status: ProductionOrderStatus.COMPLETED,
        planned: '100.0000',
        produced: '100.0000',
        activityDate: '2026-09-30',
      }),
    ]);
    const response = await kit
      .http()
      .get(endpoint + '?from=2026-10-01&to=2026-10-04')
      .set('Cookie', cookie)
      .expect(200);
    const dashboard = data<{
      period: { from: string; to: string; timeZone: string; granularity: string };
      orders: Record<string, number>;
      quantity: { planned: string; produced: string; completionRate: string | null };
      productionByPeriod: { period: string; planned: string; produced: string }[];
      recentOrders: { number: string; plannedStartAt: string | null; product: { code: string } }[];
    }>(response);

    expect(dashboard.period).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-04',
      timeZone: 'America/Managua',
      granularity: 'day',
    });
    expect(dashboard.orders).toMatchObject({
      draft: 1,
      inProgress: 1,
      completed: 1,
      cancelled: 1,
      total: 4,
    });
    expect(dashboard.quantity).toEqual({
      planned: '12.5000',
      produced: '6.2500',
      completionRate: '50.00',
    });
    expect(dashboard.productionByPeriod).toHaveLength(4);
    expect(dashboard.productionByPeriod.map((point) => point.planned)).toEqual([
      '1.2500',
      '4.0000',
      '6.2500',
      '1.0000',
    ]);
    expect(dashboard.productionByPeriod.map((point) => point.produced)).toEqual([
      '0.0000',
      '0.0000',
      '6.2500',
      '0.0000',
    ]);
    expect(dashboard.recentOrders).toHaveLength(4);
    expect(dashboard.recentOrders[0].number).toContain('-X');
    expect(dashboard.recentOrders.some((order) => order.number.includes('OUTSIDE'))).toBe(false);
    expect(dashboard.recentOrders[0].product.code).toBe(product.code);
    expect(dashboard.recentOrders[0].plannedStartAt).toBeNull();
  });

  it('filters activity by Managua calendar dates and returns an empty-safe zero percentage', async () => {
    const response = await kit
      .http()
      .get(endpoint + '?from=2026-10-20&to=2026-10-21')
      .set('Cookie', cookie)
      .expect(200);
    const dashboard = data<{
      orders: { total: number };
      quantity: { planned: string; produced: string; completionRate: string | null };
      productionByPeriod: { period: string; planned: string; produced: string }[];
      recentOrders: unknown[];
    }>(response);
    expect(dashboard.orders.total).toBe(0);
    expect(dashboard.quantity).toEqual({
      planned: '0.0000',
      produced: '0.0000',
      completionRate: null,
    });
    expect(dashboard.productionByPeriod).toHaveLength(2);
    expect(
      dashboard.productionByPeriod.every(
        (point) => point.planned === '0.0000' && point.produced === '0.0000',
      ),
    ).toBe(true);
    expect(dashboard.recentOrders).toEqual([]);
  });

  it('limits recent orders to five and keeps time-series granularity bounded', async () => {
    await Promise.all(
      Array.from({ length: 6 }, (_, index) => {
        const day = String(index + 1).padStart(2, '0');
        return createOrder({
          number: `DASH-${product.code}-R${index}`,
          status: ProductionOrderStatus.DRAFT,
          planned: '1.0000',
          produced: '0',
          activityDate: `2026-09-${day}`,
        });
      }),
    );

    const recentResponse = await kit
      .http()
      .get(endpoint + '?from=2026-09-01&to=2026-09-06')
      .set('Cookie', cookie)
      .expect(200);
    const recent = data<{ recentOrders: { number: string }[] }>(recentResponse);
    expect(recent.recentOrders).toHaveLength(5);
    expect(recent.recentOrders[0].number).toContain('-R5');

    const weeklyResponse = await kit
      .http()
      .get(endpoint + '?from=2026-08-01&to=2026-09-29')
      .set('Cookie', cookie)
      .expect(200);
    const weekly = data<{ period: { granularity: string }; productionByPeriod: unknown[] }>(
      weeklyResponse,
    );
    expect(weekly.period.granularity).toBe('week');
    expect(weekly.productionByPeriod.length).toBeLessThanOrEqual(10);

    const monthlyResponse = await kit
      .http()
      .get(endpoint + '?from=2026-01-01&to=2026-07-30')
      .set('Cookie', cookie)
      .expect(200);
    const monthly = data<{ period: { granularity: string }; productionByPeriod: unknown[] }>(
      monthlyResponse,
    );
    expect(monthly.period.granularity).toBe('month');
    expect(monthly.productionByPeriod.length).toBeLessThanOrEqual(8);
  });
});
