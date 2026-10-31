import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ProductType,
  ProductionOrderStatus,
  RoleCode,
  UnitOfMeasure,
} from '../src/generated/prisma/client.js';
import { randomUUID } from 'node:crypto';
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
  productId?: string;
  bomVersionId?: string;
  plannedDate?: string;
  completedDate?: string;
}) {
  const instant = new Date(`${options.activityDate}T12:00:00-06:00`);
  const plannedAt = new Date(`${options.plannedDate ?? options.activityDate}T12:00:00-06:00`);
  const completedAt = new Date(`${options.completedDate ?? options.activityDate}T12:00:00-06:00`);
  return kit.prisma.productionOrder.create({
    data: {
      number: options.number,
      productId: options.productId ?? product.id,
      bomVersionId: options.bomVersionId ?? versionId,
      warehouseId: warehouse.id,
      createdByUserId: actor.id,
      status: options.status,
      quantityPlanned: options.planned,
      quantityProduced: options.produced,
      plannedStartAt: plannedAt,
      startedAt:
        options.status === ProductionOrderStatus.IN_PROGRESS ||
        options.status === ProductionOrderStatus.COMPLETED
          ? instant
          : null,
      completedAt: options.status === ProductionOrderStatus.COMPLETED ? completedAt : null,
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
      .get(endpoint + `?from=2026-10-01&to=2026-10-04&productId=${product.id}`)
      .set('Cookie', cookie)
      .expect(200);
    const dashboard = data<{
      period: { from: string; to: string; timeZone: string; granularity: string };
      selectedProduct: { id: string; code: string; name: string; unit: string } | null;
      orders: Record<string, number>;
      quantity: {
        planned: string;
        produced: string;
        completionRate: string | null;
        unit: string;
      } | null;
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
      unit: UnitOfMeasure.UNIT,
    });
    expect(dashboard.selectedProduct).toMatchObject({ id: product.id, unit: UnitOfMeasure.UNIT });
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
    expect(dashboard.recentOrders[0].plannedStartAt).not.toBeNull();
  });

  it('filters activity by Managua calendar dates and returns an empty-safe zero percentage', async () => {
    const response = await kit
      .http()
      .get(endpoint + '?from=2026-10-20&to=2026-10-21')
      .set('Cookie', cookie)
      .expect(200);
    const dashboard = data<{
      orders: { total: number };
      selectedProduct: unknown;
      quantity: {
        planned: string;
        produced: string;
        completionRate: string | null;
        unit: string;
      } | null;
      productionByPeriod: { period: string; planned: string; produced: string }[];
      recentOrders: unknown[];
    }>(response);
    expect(dashboard.orders.total).toBe(0);
    expect(dashboard.selectedProduct).toBeNull();
    expect(dashboard.quantity).toBeNull();
    expect(dashboard.productionByPeriod).toEqual([]);
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

  it('does not sum quantities across units and separates planned and completed dates', async () => {
    const unitRaw = await createInventoryProduct(kit.prisma);
    const unitProduct = await kit.prisma.product.update({
      where: { id: unitRaw.id },
      data: { type: ProductType.FINISHED_GOOD, unit: UnitOfMeasure.UNIT },
    });
    const unitBom = await kit.prisma.billOfMaterial.create({
      data: { productId: unitProduct.id, name: `Dashboard ${unitProduct.code}` },
    });
    const unitVersion = await kit.prisma.bomVersion.create({
      data: {
        bomId: unitBom.id,
        version: 1,
        outputQuantity: '1',
        isActive: true,
        createdByUserId: actor.id,
      },
    });
    const literRaw = await createInventoryProduct(kit.prisma);
    const literProduct = await kit.prisma.product.update({
      where: { id: literRaw.id },
      data: { type: ProductType.FINISHED_GOOD, unit: UnitOfMeasure.LITER },
    });
    const bom = await kit.prisma.billOfMaterial.create({
      data: { productId: literProduct.id, name: `Dashboard ${literProduct.code}` },
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
    const baseline = data<{ orders: { total: number } }>(
      await kit
        .http()
        .get(endpoint + '?from=2026-10-01&to=2026-10-20')
        .set('Cookie', cookie)
        .expect(200),
    );
    await createOrder({
      number: `DASH-${unitProduct.code}-UNIT`,
      status: ProductionOrderStatus.IN_PROGRESS,
      planned: '10',
      produced: '0',
      activityDate: '2026-10-10',
      plannedDate: '2026-10-01',
      productId: unitProduct.id,
      bomVersionId: unitVersion.id,
    });
    await createOrder({
      number: `DASH-${literProduct.code}-LITER`,
      status: ProductionOrderStatus.COMPLETED,
      planned: '8',
      produced: '6',
      activityDate: '2026-10-10',
      plannedDate: '2026-10-01',
      completedDate: '2026-10-20',
      productId: literProduct.id,
      bomVersionId: version.id,
    });

    const all = data<{
      orders: { total: number };
      selectedProduct: unknown;
      quantity: unknown;
      productionByPeriod: unknown[];
    }>(
      await kit
        .http()
        .get(endpoint + '?from=2026-10-01&to=2026-10-20')
        .set('Cookie', cookie)
        .expect(200),
    );
    expect(all.orders.total).toBe(baseline.orders.total + 2);
    expect(all.selectedProduct).toBeNull();
    expect(all.quantity).toBeNull();
    expect(all.productionByPeriod).toEqual([]);

    const units = data<{
      quantity: { planned: string; produced: string; unit: string };
      productionByPeriod: { period: string; planned: string; produced: string }[];
    }>(
      await kit
        .http()
        .get(endpoint + `?from=2026-10-01&to=2026-10-20&productId=${unitProduct.id}`)
        .set('Cookie', cookie)
        .expect(200),
    );
    expect(units.quantity).toMatchObject({ planned: '10.0000', produced: '0.0000', unit: 'UNIT' });
    expect(units.productionByPeriod.find((point) => point.period === '2026-10-01')).toMatchObject({
      planned: '10.0000',
      produced: '0.0000',
    });

    const liters = data<{
      quantity: { planned: string; produced: string; unit: string };
      productionByPeriod: { period: string; planned: string; produced: string }[];
    }>(
      await kit
        .http()
        .get(endpoint + `?from=2026-10-01&to=2026-10-20&productId=${literProduct.id}`)
        .set('Cookie', cookie)
        .expect(200),
    );
    expect(liters.quantity).toMatchObject({ planned: '8.0000', produced: '6.0000', unit: 'LITER' });
    expect(liters.productionByPeriod.find((point) => point.period === '2026-10-01')).toMatchObject({
      planned: '8.0000',
      produced: '0.0000',
    });
    expect(liters.productionByPeriod.find((point) => point.period === '2026-10-20')).toMatchObject({
      planned: '0.0000',
      produced: '6.0000',
    });

    const membershipRaw = await createInventoryProduct(kit.prisma);
    const membershipProduct = await kit.prisma.product.update({
      where: { id: membershipRaw.id },
      data: { type: ProductType.FINISHED_GOOD, unit: UnitOfMeasure.UNIT },
    });
    const membershipBom = await kit.prisma.billOfMaterial.create({
      data: { productId: membershipProduct.id, name: `Dashboard ${membershipProduct.code}` },
    });
    const membershipVersion = await kit.prisma.bomVersion.create({
      data: {
        bomId: membershipBom.id,
        version: 1,
        outputQuantity: '1',
        isActive: true,
        createdByUserId: actor.id,
      },
    });
    await createOrder({
      number: `DASH-${membershipProduct.code}-MEMBERSHIP`,
      status: ProductionOrderStatus.IN_PROGRESS,
      planned: '3',
      produced: '0',
      activityDate: '2026-10-10',
      plannedDate: '2026-10-01',
      productId: membershipProduct.id,
      bomVersionId: membershipVersion.id,
    });
    const membership = data<{ orders: { total: number; inProgress: number } }>(
      await kit
        .http()
        .get(endpoint + `?from=2026-10-01&to=2026-10-01&productId=${membershipProduct.id}`)
        .set('Cookie', cookie)
        .expect(200),
    );
    expect(membership.orders).toMatchObject({ total: 1, inProgress: 1 });
  });

  it('validates productId and returns zero metrics for an existing product without orders', async () => {
    await kit
      .http()
      .get(endpoint + '?productId=not-a-uuid')
      .set('Cookie', cookie)
      .expect(400);
    await kit
      .http()
      .get(endpoint + `?productId=${randomUUID()}`)
      .set('Cookie', cookie)
      .expect(404);

    const rawProduct = await createInventoryProduct(kit.prisma);
    const emptyProduct = await kit.prisma.product.update({
      where: { id: rawProduct.id },
      data: { type: ProductType.FINISHED_GOOD },
    });
    const empty = data<{
      orders: { total: number };
      quantity: { planned: string; produced: string; completionRate: string | null; unit: string };
      productionByPeriod: { period: string; planned: string; produced: string }[];
    }>(
      await kit
        .http()
        .get(endpoint + `?from=2026-10-01&to=2026-10-02&productId=${emptyProduct.id}`)
        .set('Cookie', cookie)
        .expect(200),
    );
    expect(empty.orders.total).toBe(0);
    expect(empty.quantity).toEqual({
      planned: '0.0000',
      produced: '0.0000',
      completionRate: null,
      unit: emptyProduct.unit,
    });
    expect(empty.productionByPeriod).toEqual([
      { period: '2026-10-01', planned: '0.0000', produced: '0.0000' },
      { period: '2026-10-02', planned: '0.0000', produced: '0.0000' },
    ]);
  });
});
