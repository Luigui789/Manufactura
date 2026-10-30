import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { RoleCode } from '../src/generated/prisma/client.js';
import { TelemetryIngestionService } from '../src/iiot/readings/telemetry-ingestion.service.js';
import { parseTelemetry } from '../src/iiot/mqtt/mqtt-message.parser.js';
import type { MonitoringService } from '../src/iiot/monitoring/monitoring.service.js';
import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';
import { createInventoryProduct, createInventoryWarehouse } from './support/inventory-fixtures.js';

let kit: TestApp;
let cookie: string;
let reader: string;
const data = <T>(r: { body: unknown }) => (r.body as { data: T }).data;
const post = (path: string) =>
  kit
    .http()
    .post('/api' + path)
    .set('Cookie', cookie);
const get = (path: string) =>
  kit
    .http()
    .get('/api' + path)
    .set('Cookie', cookie);
type Overview = Awaited<ReturnType<MonitoringService['overview']>>;
type Alerts = Awaited<ReturnType<MonitoringService['alerts']>>;

beforeAll(async () => {
  kit = await createTestApp();
  cookie = await login(kit, await createUser(kit, RoleCode.ADMIN));
  reader = await login(kit, await createUser(kit, RoleCode.VENTAS));
});
afterAll(async () => {
  if (kit) await kit.close();
});

it.each([
  ['APPROVED', 'RELEASED'],
  ['REJECTED', 'REJECTED'],
] as const)(
  'CRITICAL evidence leaves quality manual: %s → %s, preserving all IIoT records',
  async (result, status) => {
    const component = await createInventoryProduct(kit.prisma);
    const rawOutput = await createInventoryProduct(kit.prisma, { isLotTracked: true });
    const output = await kit.prisma.product.update({
      where: { id: rawOutput.id },
      data: {
        type: 'FINISHED_GOOD',
        requiresQualityInspection: true,
      },
    });
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const bom = data<{ id: string }>(
      await post('/production/boms')
        .send({ productId: output.id, name: 'IIoT Quality' })
        .expect(201),
    );
    const version = data<{ id: string }>(
      await post(`/production/boms/${bom.id}/versions`)
        .send({ outputQuantity: '1', items: [{ productId: component.id, quantity: '1' }] })
        .expect(201),
    );
    await post('/inventory/adjustments')
      .send({
        productId: component.id,
        warehouseId: warehouse.id,
        type: 'ADJUSTMENT_IN',
        quantity: '10',
        reason: 'INITIAL_LOAD',
      })
      .expect(201);
    const order = data<{ id: string }>(
      await post('/production/orders')
        .send({
          productId: output.id,
          bomVersionId: version.id,
          warehouseId: warehouse.id,
          quantityPlanned: '1',
        })
        .expect(201),
    );
    await post(`/production/orders/${order.id}/start`).send({}).expect(200);
    const device = await kit.prisma.iiotDevice.create({
      data: { code: 'QUALITY-' + randomUUID(), name: 'Quality evidence', isActive: true },
    });
    const where = { productionOrderId: order.id };
    const movements = () =>
      kit.prisma.inventoryMovement.findMany({ where, orderBy: { id: 'asc' } });
    const beforeIngestion = await movements();
    const inspectionCount = await kit.prisma.qualityInspection.count();
    const ingestion = kit.app.get(TelemetryIngestionService);
    for (const value of [27, 52, 56]) {
      await ingestion.ingest(
        parseTelemetry(
          `ecosoap/production/${order.id}/${device.code}/telemetry`,
          Buffer.from(
            JSON.stringify({
              recordedAt: new Date().toISOString(),
              metrics: [{ metric: 'TEMPERATURE', value, unit: '°C' }],
            }),
          ),
        ),
      );
      expect(await movements()).toEqual(beforeIngestion);
      expect(await kit.prisma.qualityInspection.count()).toBe(inspectionCount);
      expect(await kit.prisma.lot.count({ where })).toBe(0);
    }
    const completed = data<{ status: string; lot: { id: string; status: string } }>(
      await post(`/production/orders/${order.id}/complete`)
        .send({ quantityProduced: '1', allocations: [] })
        .expect(200),
    );
    expect(completed.status).toBe('COMPLETED');
    expect(completed.lot.status).toBe('QUARANTINED');
    const lotId = completed.lot.id;
    expect(data(await get(`/production/lots/${lotId}/inspection`).expect(200))).toBeNull();
    const evidence = async () => ({
      readings: await kit.prisma.iiotReading.findMany({ where, orderBy: { id: 'asc' } }),
      alerts: await kit.prisma.iiotAlert.findMany({ where, orderBy: { id: 'asc' } }),
    });
    const before = await evidence();
    expect(before.readings).toHaveLength(3);
    expect(before.alerts.map((a) => a.severity).sort()).toEqual(['CRITICAL', 'WARNING']);
    expect(before.alerts.every((a) => a.acknowledgedAt === null)).toBe(true);
    const overviewBefore = data<Overview>(
      await get(`/iiot/production-orders/${order.id}/overview`).expect(200),
    );
    expect(overviewBefore.alerts).toMatchObject({ total: 2, warning: 1, critical: 1 });
    const alertsBefore = (await get(`/iiot/production-orders/${order.id}/alerts`).expect(200))
      .body as Alerts;
    expect(alertsBefore.data.some((a) => a.severity === 'CRITICAL')).toBe(true);
    const movementsBeforeInspection = await movements();
    // A monitoring query or unauthorized inspection cannot decide Quality.
    await kit
      .http()
      .post(`/api/production/lots/${lotId}/inspection`)
      .set('Cookie', reader)
      .send({ result: 'APPROVED', observations: 'Unauthorized' })
      .expect(403);
    expect(await kit.prisma.qualityInspection.findUnique({ where: { lotId } })).toBeNull();
    expect((await kit.prisma.lot.findUniqueOrThrow({ where: { id: lotId } })).status).toBe(
      'QUARANTINED',
    );
    if (result === 'REJECTED') {
      await post(`/production/lots/${lotId}/inspection`)
        .send({ result, observations: 'Manual' })
        .expect(422);
    }
    await post(`/production/lots/${lotId}/inspection`)
      .send({
        result,
        observations: 'Inspección manual satisfactoria / decisión explícita del inspector',
        ...(result === 'REJECTED'
          ? { nonConformities: 'Desviación confirmada por inspección humana' }
          : {}),
      })
      .expect(201);
    expect(
      (await kit.prisma.qualityInspection.findUniqueOrThrow({ where: { lotId } })).result,
    ).toBe(result);
    expect((await kit.prisma.lot.findUniqueOrThrow({ where: { id: lotId } })).status).toBe(status);
    // Full-row equality covers counts, IDs, severity, type, associations and acknowledgement.
    expect(await evidence()).toEqual(before);
    expect(await movements()).toEqual(movementsBeforeInspection);
    expect(
      data<Overview>(await get(`/iiot/production-orders/${order.id}/overview`).expect(200)),
    ).toEqual(overviewBefore);
    expect((await get(`/iiot/production-orders/${order.id}/alerts`).expect(200)).body).toEqual(
      alertsBefore,
    );
  },
  30000,
);
