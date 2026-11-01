import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IiotMetric, RoleCode } from '../src/generated/prisma/client.js';
import { parseTelemetry } from '../src/iiot/mqtt/mqtt-message.parser.js';
import { MonitoringService } from '../src/iiot/monitoring/monitoring.service.js';
import { TelemetryIngestionService } from '../src/iiot/readings/telemetry-ingestion.service.js';
import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';
import { createInventoryProduct, createInventoryWarehouse } from './support/inventory-fixtures.js';

let kit: TestApp;
let cookie: string;
let orderId: string;
let emptyOrderId: string;
let otherOrderId: string;
let device: { id: string; code: string; name: string };
let otherDeviceId: string;
const times = ['2026-10-30T10:00:00Z', '2026-10-30T11:00:00Z', '2026-10-30T12:00:00Z'];
const ids = Array.from({ length: 4 }, () => randomUUID()).sort();
let readingIds: string[];
let alertIds: string[];

type Overview = Awaited<ReturnType<MonitoringService['overview']>>;
type Readings = Awaited<ReturnType<MonitoringService['readings']>>;
type Alerts = Awaited<ReturnType<MonitoringService['alerts']>>;

async function get<T>(id: string, endpoint: string, query: Record<string, string | number> = {}) {
  const response = await kit
    .http()
    .get(`/api/iiot/production-orders/${id}/${endpoint}`)
    .query(query)
    .set('Cookie', cookie)
    .expect(200);
  return response.body as T;
}

beforeAll(async () => {
  kit = await createTestApp();
  // A general authenticated role, without ADMIN/PRODUCCION privileges.
  const user = await createUser(kit, RoleCode.VENTAS);
  cookie = await login(kit, user);
  const product = await createInventoryProduct(kit.prisma);
  const warehouse = await createInventoryWarehouse(kit.prisma);
  const bom = await kit.prisma.billOfMaterial.create({
    data: {
      productId: product.id,
      name: 'Monitoring fixture',
      versions: { create: { version: 1, outputQuantity: '1', createdByUserId: user.id } },
    },
    include: { versions: true },
  });
  const orders = [];
  for (let i = 0; i < 3; i++) {
    orders.push(
      await kit.prisma.productionOrder.create({
        data: {
          number: `MON-${randomUUID().slice(0, 8)}`,
          productId: product.id,
          warehouseId: warehouse.id,
          bomVersionId: bom.versions[0].id,
          quantityPlanned: '1',
          createdByUserId: user.id,
          status: 'IN_PROGRESS',
          startedAt: new Date(times[0]),
        },
      }),
    );
  }
  [orderId, emptyOrderId, otherOrderId] = orders.map((o) => o.id);
  device = await kit.prisma.iiotDevice.create({
    data: {
      code: `MON-${randomUUID()}`,
      name: 'Monitoring device',
      description: 'Private metadata',
    },
    select: { id: true, code: true, name: true },
  });
  otherDeviceId = (
    await kit.prisma.iiotDevice.create({
      data: {
        code: `MON-${randomUUID()}`,
        name: 'Other device',
      },
    })
  ).id;
  readingIds = [];
  for (const [index, value] of ['25', '26', '27', '28'].entries()) {
    const row = await kit.prisma.iiotReading.create({
      data: {
        id: ids[index],
        productionOrderId: orderId,
        deviceId: index === 3 ? otherDeviceId : device.id,
        metric: 'TEMPERATURE',
        value,
        unit: '°C',
        recordedAt: new Date(times[Math.min(index, 2)]),
        // Receipt order deliberately differs from measurement order.
        receivedAt: new Date(times[index === 0 ? 2 : 0]),
      },
    });
    readingIds.push(row.id);
  }
  await kit.prisma.iiotReading.createMany({
    data: [
      ...Object.values(IiotMetric)
        .filter((metric) => metric !== 'TEMPERATURE')
        .map((metric) => ({
          productionOrderId: orderId,
          deviceId: device.id,
          metric,
          value: metric === 'PH' ? '12345678901234.1234' : '12.1234',
          unit: 'unit',
          recordedAt: new Date(times[0]),
        })),
      {
        productionOrderId: otherOrderId,
        deviceId: device.id,
        metric: 'TEMPERATURE',
        value: '99',
        unit: '°C',
        recordedAt: new Date(times[2]),
      },
    ],
  });
  alertIds = [];
  for (let i = 0; i < 4; i++) {
    const alert = await kit.prisma.iiotAlert.create({
      data: {
        id: ids[i],
        productionOrderId: orderId,
        readingId: i === 3 ? null : readingIds[i],
        type: i < 2 ? 'HIGH_TEMPERATURE' : 'MANUAL',
        severity: i % 2 ? 'CRITICAL' : 'WARNING',
        message: 'Monitoring fixture',
        createdAt: new Date(times[Math.min(i, 2)]),
        acknowledgedAt: i === 0 ? new Date(times[2]) : null,
      },
    });
    alertIds.push(alert.id);
  }
  await kit.prisma.iiotAlert.create({
    data: {
      productionOrderId: otherOrderId,
      type: 'OTHER',
      severity: 'CRITICAL',
      message: 'Other OP',
    },
  });
}, 30000);

afterAll(async () => {
  if (kit) await kit.close();
});

describe('IIoT monitoring HTTP with real PostgreSQL', () => {
  it('returns zero counts and null last dates for an OP without telemetry', async () => {
    const body = await get<{ data: Overview }>(emptyOrderId, 'overview');
    expect(body.data.telemetry).toEqual({
      totalReadings: 0,
      lastReadingAt: null,
      latestByMetric: [],
    });
    expect(body.data.alerts).toEqual({
      total: 0,
      warning: 0,
      critical: 0,
      unacknowledged: 0,
      lastAlertAt: null,
    });
    expect((await get<Readings>(emptyOrderId, 'readings')).meta.total).toBe(0);
    expect((await get<Alerts>(emptyOrderId, 'alerts')).data).toEqual([]);
  });

  it('selects one latest per metric by recordedAt then id and counts all alert severities', async () => {
    const { data } = await get<{ data: Overview }>(orderId, 'overview');
    expect(data.productionOrder).toMatchObject({
      id: orderId,
      status: 'IN_PROGRESS',
    });
    expect(typeof data.productionOrder.product.id).toBe('string');
    expect(Object.keys(data.productionOrder).sort()).toEqual([
      'completedAt',
      'id',
      'number',
      'product',
      'startedAt',
      'status',
    ]);
    expect(data.telemetry.totalReadings).toBe(8);
    expect(data.telemetry.lastReadingAt).toBe('2026-10-30T12:00:00.000Z');
    expect(data.telemetry.latestByMetric).toHaveLength(5);
    expect(new Set(data.telemetry.latestByMetric.map((r) => r.metric)).size).toBe(5);
    expect(data.telemetry.latestByMetric.find((r) => r.metric === 'TEMPERATURE')).toMatchObject({
      id: readingIds[3],
      value: '28.0000',
    });
    expect(data.alerts).toEqual({
      total: 4,
      warning: 2,
      critical: 2,
      unacknowledged: 3,
      lastAlertAt: '2026-10-30T12:00:00.000Z',
    });
  });

  it('paginates readings deterministically, preserving precision and projecting device only', async () => {
    const query = { metric: 'TEMPERATURE', limit: 2 };
    const first = await get<Readings>(orderId, 'readings', query);
    const second = await get<Readings>(orderId, 'readings', { ...query, page: 2 });
    expect(first.meta).toEqual({ page: 1, limit: 2, total: 4 });
    expect([...first.data, ...second.data].map((r) => r.id)).toEqual([...readingIds].reverse());
    expect(second.data[0]).toEqual({
      id: readingIds[1],
      productionOrderId: orderId,
      metric: 'TEMPERATURE',
      value: '26.0000',
      unit: '°C',
      recordedAt: '2026-10-30T11:00:00.000Z',
      receivedAt: '2026-10-30T10:00:00.000Z',
      device,
    });
    expect((await get<Readings>(orderId, 'readings')).meta).toEqual({
      page: 1,
      limit: 20,
      total: 8,
    });
    expect((await get<Readings>(orderId, 'readings', { page: 100 })).data).toEqual([]);
    const precise = await get<Readings>(orderId, 'readings', { metric: 'PH' });
    expect(precise.data[0].value).toBe('12345678901234.1234');
  });

  it.each([
    [{ deviceId: 'other' }, [3]],
    [{ from: times[1] }, [3, 2, 1]],
    [{ to: times[1] }, [1, 0]],
    [{ from: '2026-10-30T05:00:00-06:00', to: times[1] }, [1]],
  ] as const)('filters readings inclusively on recordedAt: %j', async (filters, expected) => {
    const query: Record<string, string> = { ...filters, metric: 'TEMPERATURE' };
    if ('deviceId' in query) query.deviceId = otherDeviceId;
    const result = await get<Readings>(orderId, 'readings', query);
    expect(result.data.map((r) => r.id)).toEqual(expected.map((i) => readingIds[i]));
    expect(result.meta.total).toBe(expected.length);
  });

  it('paginates alerts with nullable reading, device, decimal and acknowledgedAt', async () => {
    const first = await get<Alerts>(orderId, 'alerts', { limit: 2 });
    const second = await get<Alerts>(orderId, 'alerts', { limit: 2, page: 2 });
    expect(first.meta).toEqual({ page: 1, limit: 2, total: 4 });
    expect([...first.data, ...second.data].map((a) => a.id)).toEqual([...alertIds].reverse());
    expect(first.data[0].reading).toBeNull();
    expect(second.data[1]).toEqual({
      id: alertIds[0],
      productionOrderId: orderId,
      type: 'HIGH_TEMPERATURE',
      severity: 'WARNING',
      message: 'Monitoring fixture',
      createdAt: '2026-10-30T10:00:00.000Z',
      acknowledgedAt: '2026-10-30T12:00:00.000Z',
      reading: {
        id: readingIds[0],
        metric: 'TEMPERATURE',
        value: '25.0000',
        unit: '°C',
        recordedAt: '2026-10-30T10:00:00.000Z',
        device,
      },
    });
  });

  it.each([
    [{ severity: 'WARNING' }, [2, 0]],
    [{ severity: 'CRITICAL' }, [3, 1]],
    [{ type: '  HIGH_TEMPERATURE  ' }, [1, 0]],
    [{ type: 'high_temperature' }, []],
    [{ from: times[1] }, [3, 2, 1]],
    [{ to: times[1] }, [1, 0]],
    [{ from: times[1], to: '2026-10-30T05:00:00-06:00' }, [1]],
    [{ severity: 'CRITICAL', type: 'HIGH_TEMPERATURE', from: times[0], to: times[1] }, [1]],
  ] as const)('filters alerts inclusively on createdAt: %j', async (query, expected) => {
    const result = await get<Alerts>(orderId, 'alerts', query);
    expect(result.data.map((a) => a.id)).toEqual(expected.map((i) => alertIds[i]));
    expect(result.meta.total).toBe(expected.length);
  });

  it.each(['overview', 'readings', 'alerts'])(
    '%s requires authentication, validates id and returns 404',
    async (endpoint) => {
      await kit.http().get(`/api/iiot/production-orders/${orderId}/${endpoint}`).expect(401);
      await kit
        .http()
        .get(`/api/iiot/production-orders/invalid/${endpoint}`)
        .set('Cookie', cookie)
        .expect(400);
      await kit
        .http()
        .get(`/api/iiot/production-orders/${randomUUID()}/${endpoint}`)
        .set('Cookie', cookie)
        .expect(404);
    },
  );

  for (const endpoint of ['readings', 'alerts']) {
    it.each([
      { page: 0 },
      { page: -1 },
      { page: 1.5 },
      { page: 'bad' },
      { limit: 101 },
      { limit: 0 },
      { limit: 1.5 },
      { from: 'bad' },
      { to: 'bad' },
      { from: '2026-10-30' },
      { from: '2026-10-30T10:00:00' },
      { to: '2026-02-30T10:00:00Z' },
      { from: times[2], to: times[0] },
      { unknown: 'value' },
      ...(endpoint === 'readings'
        ? [{ metric: 'INVALID' }, { deviceId: 'invalid' }]
        : [{ severity: 'INVALID' }, { type: 'a'.repeat(81) }, { type: '   ' }]),
    ])(`${endpoint} rejects invalid query %j`, async (query) => {
      await kit
        .http()
        .get(`/api/iiot/production-orders/${orderId}/${endpoint}`)
        .query(query)
        .set('Cookie', cookie)
        .expect(400);
    });
  }

  it('keeps historical monitoring available after completion', async () => {
    await kit.prisma.productionOrder.update({
      where: { id: otherOrderId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(times[2]),
        quantityProduced: '1',
      },
    });
    const overview = await get<{ data: Overview }>(otherOrderId, 'overview');
    expect(overview.data.productionOrder.status).toBe('COMPLETED');
    expect(overview.data.telemetry.latestByMetric).toHaveLength(1);
    expect(overview.data.telemetry.latestByMetric[0].value).toBe('99.0000');
    expect((await get<Readings>(otherOrderId, 'readings')).meta.total).toBe(1);
    expect((await get<Alerts>(otherOrderId, 'alerts')).meta.total).toBe(1);
  });

  it('exposes real normal/deviation ingestion through authenticated HTTP and changes no monitored entities', async () => {
    const ingestion = kit.app.get(TelemetryIngestionService);
    for (const value of [27, 55]) {
      await ingestion.ingest(
        parseTelemetry(
          `ecosoap/production/${emptyOrderId}/${device.code}/telemetry`,
          Buffer.from(
            JSON.stringify({
              recordedAt: times[0],
              metrics: [{ metric: 'TEMPERATURE', value, unit: '°C' }],
            }),
          ),
        ),
      );
    }
    const counts = () =>
      Promise.all([
        kit.prisma.productionOrder.count(),
        kit.prisma.iiotReading.count(),
        kit.prisma.iiotAlert.count(),
        kit.prisma.lot.count(),
        kit.prisma.qualityInspection.count(),
        kit.prisma.inventoryMovement.count(),
      ]);
    const before = await counts();
    const orderBefore = await kit.prisma.productionOrder.findUnique({
      where: { id: emptyOrderId },
    });
    const overview = await get<{ data: Overview }>(emptyOrderId, 'overview');
    const readings = await get<Readings>(emptyOrderId, 'readings');
    const alerts = await get<Alerts>(emptyOrderId, 'alerts');
    const stored = await kit.prisma.iiotReading.findMany({
      where: { productionOrderId: emptyOrderId },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    });
    expect(readings.data.map((r) => [r.id, r.value])).toEqual(
      stored.map((r) => [r.id, r.value.toFixed(4)]),
    );
    expect(overview.data.telemetry.totalReadings).toBe(2);
    expect(overview.data.alerts).toMatchObject({
      total: 1,
      critical: 1,
      warning: 0,
      unacknowledged: 1,
    });
    expect(alerts.data[0]).toMatchObject({
      type: 'HIGH_TEMPERATURE',
      severity: 'CRITICAL',
      reading: { value: '55.0000', device },
    });
    expect(await counts()).toEqual(before);
    expect(await kit.prisma.productionOrder.findUnique({ where: { id: emptyOrderId } })).toEqual(
      orderBefore,
    );
  });
});
