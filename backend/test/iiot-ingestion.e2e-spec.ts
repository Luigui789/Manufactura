import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Prisma, RoleCode, type ProductionOrderStatus } from '../src/generated/prisma/client.js';
import { parseTelemetry } from '../src/iiot/mqtt/mqtt-message.parser.js';
import { TelemetryRejectedError } from '../src/iiot/mqtt/mqtt-message.types.js';
import { TelemetryIngestionService } from '../src/iiot/readings/telemetry-ingestion.service.js';
import { createTestApp, createUser, type TestApp } from './support/auth-test-kit.js';
import { createInventoryProduct, createInventoryWarehouse } from './support/inventory-fixtures.js';

let kit: TestApp;
let ingestion: TelemetryIngestionService;
let productId: string;
let warehouseId: string;
let bomVersionId: string;
let actorId: string;
beforeAll(async () => {
  kit = await createTestApp();
  ingestion = kit.app.get(TelemetryIngestionService);
  actorId = (await createUser(kit, RoleCode.PRODUCCION)).id;
  productId = (await createInventoryProduct(kit.prisma)).id;
  warehouseId = (await createInventoryWarehouse(kit.prisma)).id;
  const bom = await kit.prisma.billOfMaterial.create({
    data: {
      productId,
      name: 'Ingestion fixture',
      versions: { create: { version: 1, outputQuantity: '1', createdByUserId: actorId } },
    },
    include: { versions: true },
  });
  bomVersionId = bom.versions[0].id;
}, 30000);
afterAll(async () => {
  if (kit) await kit.close();
});

async function fixture(status: ProductionOrderStatus = 'IN_PROGRESS', isActive = true) {
  const order = await kit.prisma.productionOrder.create({
    data: {
      number: `IIOT-${randomUUID().slice(0, 8)}`,
      productId,
      warehouseId,
      bomVersionId,
      quantityPlanned: '1',
      createdByUserId: actorId,
      status,
      startedAt: status === 'IN_PROGRESS' || status === 'COMPLETED' ? new Date() : null,
      completedAt: status === 'COMPLETED' ? new Date() : null,
      quantityProduced: status === 'COMPLETED' ? '1' : '0',
    },
  });
  const device = await kit.prisma.iiotDevice.create({
    data: { code: `TANK-${randomUUID().slice(0, 8)}`, name: 'Fixture', isActive },
  });
  const message = parseTelemetry(
    `ecosoap/production/${order.id}/${device.code}/telemetry`,
    Buffer.from(
      JSON.stringify({
        recordedAt: '2026-10-30T04:00:00-06:00',
        metrics: [
          { metric: 'TEMPERATURE', value: -10.1234, unit: '°C' },
          { metric: 'PH', value: 14, unit: 'pH' },
        ],
      }),
    ),
  );
  return { order, device, message };
}
describe('IIoT ingestion with real PostgreSQL, no MQTT connection in test', () => {
  it('persists two metrics with shared source, timestamp, precise decimal and database receivedAt; no alerts or process effects', async () => {
    const { order, device, message } = await fixture();
    const movements = await kit.prisma.inventoryMovement.count();
    const lots = await kit.prisma.lot.count();
    const inspections = await kit.prisma.qualityInspection.count();
    const alerts = await kit.prisma.iiotAlert.count();
    await ingestion.ingest(message);
    const rows = await kit.prisma.iiotReading.findMany({
      where: { productionOrderId: order.id },
      orderBy: { metric: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.metric, r.value.toFixed(4), r.unit])).toEqual([
      ['TEMPERATURE', '-10.1234', '°C'],
      ['PH', '14.0000', 'pH'],
    ]);
    for (const row of rows) {
      expect(row.deviceId).toBe(device.id);
      expect(row.recordedAt.toISOString()).toBe('2026-10-30T10:00:00.000Z');
      expect(row.receivedAt).toBeInstanceOf(Date);
    }
    expect(await kit.prisma.productionOrder.findUnique({ where: { id: order.id } })).toEqual(order);
    expect(await kit.prisma.inventoryMovement.count()).toBe(movements);
    expect(await kit.prisma.lot.count()).toBe(lots);
    expect(await kit.prisma.qualityInspection.count()).toBe(inspections);
    expect(await kit.prisma.iiotAlert.count()).toBe(alerts);
  });
  it.each(['DRAFT', 'COMPLETED', 'CANCELLED'] as const)(
    'rejects %s without writes',
    async (status) => {
      const { order, message } = await fixture(status);
      await expect(ingestion.ingest(message)).rejects.toBeInstanceOf(TelemetryRejectedError);
      expect(await kit.prisma.iiotReading.count({ where: { productionOrderId: order.id } })).toBe(
        0,
      );
    },
  );
  it('rejects missing orders without writes', async () => {
    const { message } = await fixture();
    const before = await kit.prisma.iiotReading.count();
    await expect(
      ingestion.ingest({ ...message, productionOrderId: randomUUID() }),
    ).rejects.toBeInstanceOf(TelemetryRejectedError);
    expect(await kit.prisma.iiotReading.count()).toBe(before);
  });
  it.each([false, true])('rejects inactive or missing devices (missing=%s)', async (missing) => {
    const { order, message } = await fixture('IN_PROGRESS', false);
    if (missing) message.deviceCode = 'MISSING-' + randomUUID();
    await expect(ingestion.ingest(message)).rejects.toBeInstanceOf(TelemetryRejectedError);
    expect(await kit.prisma.iiotReading.count({ where: { productionOrderId: order.id } })).toBe(0);
  });
  it('rolls back the entire metric batch when one row violates a real PostgreSQL constraint', async () => {
    const { order, message } = await fixture();
    // Intentionally bypass the parser to exercise the database failure path.
    message.metrics[1].value = new Prisma.Decimal('NaN');
    await expect(ingestion.ingest(message)).rejects.toThrow();
    expect(await kit.prisma.iiotReading.count({ where: { productionOrderId: order.id } })).toBe(0);
  });
});
