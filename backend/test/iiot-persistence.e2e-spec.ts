import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { RoleCode } from '../src/generated/prisma/client.js';
import { createTestApp, createUser, type TestApp } from './support/auth-test-kit.js';
import { createInventoryProduct, createInventoryWarehouse } from './support/inventory-fixtures.js';

let kit: TestApp;
beforeAll(async () => {
  kit = await createTestApp();
});
afterAll(async () => {
  if (kit) await kit.close();
});

it('Prisma persists UUID v7 telemetry and exposes the OP/device/reading inverse relations', async () => {
  const actor = await createUser(kit, RoleCode.PRODUCCION);
  const product = await createInventoryProduct(kit.prisma);
  const warehouse = await createInventoryWarehouse(kit.prisma);
  const bom = await kit.prisma.billOfMaterial.create({
    data: {
      productId: product.id,
      name: 'IIoT fixture',
      versions: { create: { version: 1, outputQuantity: '1', createdByUserId: actor.id } },
    },
    include: { versions: true },
  });
  const order = await kit.prisma.productionOrder.create({
    data: {
      number: `IIOT-${randomUUID().slice(0, 8)}`,
      productId: product.id,
      bomVersionId: bom.versions[0].id,
      warehouseId: warehouse.id,
      quantityPlanned: '1',
      createdByUserId: actor.id,
    },
  });
  const device = await kit.prisma.iiotDevice.create({
    data: { code: `TANK-${randomUUID().slice(0, 8)}`, name: 'Tank fixture' },
  });
  const reading = await kit.prisma.iiotReading.create({
    data: {
      productionOrderId: order.id,
      deviceId: device.id,
      metric: 'PH',
      value: '7.1234',
      unit: 'pH',
      recordedAt: new Date('2026-10-30T06:00:00Z'),
    },
  });
  const alert = await kit.prisma.iiotAlert.create({
    data: {
      productionOrderId: order.id,
      readingId: reading.id,
      type: 'PH_OUT_OF_RANGE',
      severity: 'WARNING',
      message: 'Persistence fixture only',
    },
  });
  for (const entity of [device, reading, alert]) expect(entity.id[14]).toBe('7');
  expect(device.isActive).toBe(true);
  expect(reading.value.toFixed(4)).toBe('7.1234');
  expect(reading.receivedAt).toBeInstanceOf(Date);
  expect(alert.acknowledgedAt).toBeNull();
  const traced = await kit.prisma.productionOrder.findUniqueOrThrow({
    where: { id: order.id },
    include: { iiotReadings: { include: { device: true, alerts: true } }, iiotAlerts: true },
  });
  expect(traced.iiotReadings[0].device.id).toBe(device.id);
  expect(traced.iiotReadings[0].alerts[0].id).toBe(alert.id);
  expect(traced.iiotAlerts[0].id).toBe(alert.id);
  const source = await kit.prisma.iiotDevice.findUniqueOrThrow({
    where: { id: device.id },
    include: { readings: true },
  });
  expect(source.readings[0].id).toBe(reading.id);
});
