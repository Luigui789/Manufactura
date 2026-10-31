import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { RoleCode } from '../src/generated/prisma/client.js';
import { SimulatorRunner } from '../src/iiot/simulation/simulator-runner.service.js';
import { SimulationService } from '../src/iiot/simulation/simulation.service.js';
import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';
import { createInventoryProduct, createInventoryWarehouse } from './support/inventory-fixtures.js';

let kit: TestApp;
const cookies: Partial<Record<RoleCode, string>> = {};
let actorId: string;
type Status = Awaited<ReturnType<SimulationService['status']>>;
const data = (r: { body: unknown }) => (r.body as { data: Status }).data;
const url = (id: string) => `/api/iiot/production-orders/${id}/simulation`;

beforeAll(async () => {
  kit = await createTestApp();
  for (const role of [RoleCode.ADMIN, RoleCode.PRODUCCION, RoleCode.VENTAS]) {
    const actor = await createUser(kit, role);
    actorId = actor.id;
    cookies[role] = await login(kit, actor);
  }
});
afterEach(async () => {
  await kit.app.get(SimulationService).onModuleDestroy();
  vi.restoreAllMocks();
});
afterAll(async () => {
  if (kit) await kit.close();
});

async function order(status: 'IN_PROGRESS' | 'DRAFT' | 'COMPLETED' = 'IN_PROGRESS') {
  const product = await createInventoryProduct(kit.prisma);
  const warehouse = await createInventoryWarehouse(kit.prisma);
  const bom = await kit.prisma.billOfMaterial.create({
    data: {
      productId: product.id,
      name: 'Simulation contract',
      versions: { create: { version: 1, outputQuantity: '1', createdByUserId: actorId } },
    },
    include: { versions: true },
  });
  return kit.prisma.productionOrder.create({
    data: {
      number: 'SIM-' + randomUUID().slice(0, 12),
      productId: product.id,
      warehouseId: warehouse.id,
      bomVersionId: bom.versions[0].id,
      quantityPlanned: '1',
      createdByUserId: actorId,
      status,
      ...(status !== 'DRAFT' ? { startedAt: new Date() } : {}),
      ...(status === 'COMPLETED' ? { completedAt: new Date(), quantityProduced: '1' } : {}),
    },
  });
}

function runner() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const completion = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const service = kit.app.get(SimulatorRunner);
  vi.spyOn(service, 'available', 'get').mockReturnValue(true);
  const start = vi
    .spyOn(service, 'start')
    .mockImplementation((_id, _device, _options, progress) => {
      progress(1);
      return { completion, stop: () => reject(new Error('stopped')) };
    });
  return { start, resolve, reject };
}

it.each([RoleCode.ADMIN, RoleCode.PRODUCCION])(
  '%s can launch one run and progress survives another request, without business mutations',
  async (role) => {
    const mock = runner();
    const op = await order();
    const before = {
      inspections: await kit.prisma.qualityInspection.count(),
      movements: await kit.prisma.inventoryMovement.count(),
      lots: await kit.prisma.lot.count(),
    };
    const start = data(
      await kit
        .http()
        .post(url(op.id))
        .set('Cookie', cookies[role]!)
        .send({ process: 'bar', scenario: 'normal' })
        .expect(202),
    );
    expect(start).toMatchObject({
      status: 'RUNNING',
      publishedSamples: 1,
      totalSamples: 60,
      receivedReadings: 0,
    });
    const device = await kit.prisma.iiotDevice.findUniqueOrThrow({
      where: { code: start.deviceCode! },
    });
    expect(device.isActive).toBe(true);
    expect(device.name).toContain('DEMO / SYNTHETIC');
    await kit
      .http()
      .post(url(op.id))
      .set('Cookie', cookies[role]!)
      .send({ process: 'liquid', scenario: 'deviation' })
      .expect(409);
    expect(mock.start).toHaveBeenCalledTimes(1);
    // Controlled child for HTTP/RBAC tests; real MQTT/CLI acceptance lives in docker/verify.mjs.
    await kit.prisma.iiotReading.createMany({
      data: Array.from({ length: 120 }, () => ({
        productionOrderId: op.id,
        deviceId: device.id,
        metric: 'TEMPERATURE',
        value: '27',
        unit: '°C',
        recordedAt: new Date(),
      })),
    });
    mock.resolve();
    await vi.waitFor(async () =>
      expect(
        data(await kit.http().get(url(op.id)).set('Cookie', cookies.VENTAS!).expect(200)),
      ).toMatchObject({ status: 'COMPLETED', receivedReadings: 120 }),
    );
    expect(await kit.prisma.productionOrder.findUnique({ where: { id: op.id } })).toEqual(op);
    expect({
      inspections: await kit.prisma.qualityInspection.count(),
      movements: await kit.prisma.inventoryMovement.count(),
      lots: await kit.prisma.lot.count(),
    }).toEqual(before);
  },
);

it('enforces authentication, roles, enum DTOs and UUIDs', async () => {
  const mock = runner();
  const op = await order();
  await kit.http().get(url(op.id)).expect(401);
  await kit.http().post(url(op.id)).send({ process: 'bar', scenario: 'normal' }).expect(401);
  await kit
    .http()
    .post(url(op.id))
    .set('Cookie', cookies.VENTAS!)
    .send({ process: 'bar', scenario: 'normal' })
    .expect(403);
  for (const body of [
    {},
    { process: 'invalid', scenario: 'normal' },
    { process: 'bar', scenario: 'invalid' },
    { process: 'bar', scenario: 'normal', command: 'anything' },
  ]) {
    await kit.http().post(url(op.id)).set('Cookie', cookies.ADMIN!).send(body).expect(400);
  }
  await kit.http().get(url('invalid')).set('Cookie', cookies.ADMIN!).expect(400);
  await kit.http().get(url(randomUUID())).set('Cookie', cookies.ADMIN!).expect(404);
  expect(mock.start).not.toHaveBeenCalled();
});

it.each(['DRAFT', 'COMPLETED'] as const)(
  'rejects %s without creating a device or starting production',
  async (state) => {
    const mock = runner();
    const op = await order(state);
    const devices = await kit.prisma.iiotDevice.count();
    await kit
      .http()
      .post(url(op.id))
      .set('Cookie', cookies.ADMIN!)
      .send({ process: 'bar', scenario: 'normal' })
      .expect(409);
    expect(await kit.prisma.iiotDevice.count()).toBe(devices);
    expect(mock.start).not.toHaveBeenCalled();
    expect(await kit.prisma.productionOrder.findUnique({ where: { id: op.id } })).toEqual(op);
  },
);

it('reports a failed child safely and permits an explicit retry', async () => {
  const mock = runner();
  const op = await order();
  await kit
    .http()
    .post(url(op.id))
    .set('Cookie', cookies.ADMIN!)
    .send({ process: 'bar', scenario: 'normal' })
    .expect(202);
  mock.reject(new Error('private broker error'));
  await vi.waitFor(async () => {
    const status = data(await kit.http().get(url(op.id)).set('Cookie', cookies.ADMIN!).expect(200));
    expect(status.status).toBe('FAILED');
    expect(status.error).not.toContain('private');
  });
  const next = runner();
  await kit
    .http()
    .post(url(op.id))
    .set('Cookie', cookies.ADMIN!)
    .send({ process: 'bar', scenario: 'normal' })
    .expect(202);
  next.reject(new Error('test cleanup'));
});

it('does not equate successful MQTT publication with accepted readings', async () => {
  const mock = runner();
  const op = await order();
  await kit
    .http()
    .post(url(op.id))
    .set('Cookie', cookies.ADMIN!)
    .send({ process: 'bar', scenario: 'normal' })
    .expect(202);
  mock.resolve();
  await vi.waitFor(
    async () =>
      expect(
        data(await kit.http().get(url(op.id)).set('Cookie', cookies.ADMIN!).expect(200)),
      ).toMatchObject({ status: 'FAILED', receivedReadings: 0 }),
    { timeout: 4000 },
  );
});

it('rejects an unavailable simulator without provisioning devices', async () => {
  const op = await order();
  vi.spyOn(kit.app.get(SimulatorRunner), 'available', 'get').mockReturnValue(false);
  const devices = await kit.prisma.iiotDevice.count();
  await kit
    .http()
    .post(url(op.id))
    .set('Cookie', cookies.ADMIN!)
    .send({ process: 'bar', scenario: 'normal' })
    .expect(409);
  expect(await kit.prisma.iiotDevice.count()).toBe(devices);
});
