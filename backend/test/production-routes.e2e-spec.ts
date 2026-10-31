import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuditService } from '../src/audit/audit.service.js';

import { RoleCode, type Product } from '../src/generated/prisma/client.js';

import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';

let kit: TestApp;

const cookies = new Map<RoleCode, string>();

const base = '/api/production/routes';

type Route = {
  id: string;
  productId: string;
  code: string;
  name: string;
  isActive: boolean;
  totalStandardMinutes: string;
  operationCount: number;
  operations: { id: string; sequence: number; name: string; standardMinutes: string }[];
};

const data = (r: { body: unknown }) => (r.body as { data: Route }).data;

const ops = [
  { sequence: 50, name: 'Empaque', standardMinutes: '5.00' },
  { sequence: 30, name: 'Curado', standardMinutes: '21600.00' },
  { sequence: 10, name: 'Mezclado', standardMinutes: '15.00' },
  { sequence: 40, name: 'Inspección', standardMinutes: '5.00' },
  { sequence: 20, name: 'Moldeado', standardMinutes: '10.00' },
];

const http = () => kit.http();

async function product(change: Partial<Product> = {}) {
  return kit.prisma.product.create({
    data: {
      code: 'ROUTE-' + randomUUID(),
      name: 'Jabón C1 ' + randomUUID(),
      category: 'C1',
      type: 'FINISHED_GOOD',
      unit: 'UNIT',
      isLotTracked: false,
      ...change,
    },
  });
}

async function payload(change: Partial<Product> = {}) {
  return {
    productId: (await product(change)).id,
    code: 'RT-' + randomUUID().slice(0, 20),
    name: 'Ruta jabón',
    operations: ops,
  };
}

async function create() {
  return data(
    await http()
      .post(base)
      .set('Cookie', cookies.get('PRODUCCION')!)
      .send(await payload())
      .expect(201),
  );
}

beforeAll(async () => {
  kit = await createTestApp();
  for (const role of Object.values(RoleCode))
    cookies.set(role, await login(kit, await createUser(kit, role)));
}, 30000);

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  if (kit) await kit.close();
});

describe('Production routes PostgreSQL', () => {
  it('persists five ordered operations, exact totals, metadata, status and audit snapshots', async () => {
    const input = await payload();
    input.code = ' rt-jabon-' + randomUUID().slice(0, 8) + ' ';
    input.name = ' Ruta jabón ';

    const created = await http()
      .post(base)
      .set('Cookie', cookies.get('PRODUCCION')!)
      .send(input)
      .expect(201);

    const route = data(created);
    expect(route.code).toBe(input.code.trim().toUpperCase());
    expect(route.name).toBe('Ruta jabón');

    expect(route.operations.map((o) => o.sequence)).toEqual([10, 20, 30, 40, 50]);
    expect(route.totalStandardMinutes).toBe('21635.00');

    expect(
      data(
        await http()
          .get(base + '/' + route.id)
          .set('Cookie', cookies.get('VENTAS')!)
          .expect(200),
      ),
    ).toEqual(route);

    for (const search of [route.code, 'jabón']) {
      const list = await http()
        .get(base)
        .query({ search, productId: route.productId })
        .set('Cookie', cookies.get('VENTAS')!)
        .expect(200);

      expect((list.body as { data: Route[] }).data[0]).toMatchObject({
        id: route.id,
        operationCount: 5,
        totalStandardMinutes: '21635.00',
      });
    }

    await http()
      .patch(base + '/' + route.id)
      .set('Cookie', cookies.get('ADMIN')!)
      .send({ name: 'Nueva ruta' })
      .expect(200);

    const changed = data(
      await http()
        .put(base + '/' + route.id + '/operations')
        .set('Cookie', cookies.get('PRODUCCION')!)
        .send({ operations: [{ sequence: 15, name: 'Única', standardMinutes: '0.10' }] })
        .expect(200),
    );

    expect(changed.totalStandardMinutes).toBe('0.10');
    expect(changed.operations).toHaveLength(1);

    for (const isActive of [false, true]) {
      await http()
        .patch(base + '/' + route.id + '/status')
        .set('Cookie', cookies.get('PRODUCCION')!)
        .send({ isActive })
        .expect(200);

      await http()
        .patch(base + '/' + route.id + '/status')
        .set('Cookie', cookies.get('PRODUCCION')!)
        .send({ isActive })
        .expect(409);

      const list = await http()
        .get(base)
        .query({ productId: route.productId, isActive })
        .set('Cookie', cookies.get('VENTAS')!)
        .expect(200);

      expect((list.body as { data: Route[] }).data).toHaveLength(1);
    }

    const logs = await kit.prisma.auditLog.findMany({
      where: { entityId: route.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(logs.map((l) => l.action)).toEqual(['CREATE', 'UPDATE', 'UPDATE', 'DISABLE', 'ENABLE']);

    expect(logs[2].previousValues).toMatchObject({
      operations: expect.arrayContaining([
        expect.objectContaining({ standardMinutes: '21600.00' }),
      ]),
    });

    expect(logs[2].newValues).toMatchObject({
      operations: [{ sequence: 15, name: 'Única', description: null, standardMinutes: '0.10' }],
    });
  });

  it.each(['INTERMEDIATE', 'FINISHED_GOOD'] as const)(
    'accepts active %s without lot tracking',
    async (type) => {
      await http()
        .post(base)
        .set('Cookie', cookies.get('PRODUCCION')!)
        .send(await payload({ type }))
        .expect(201);
    },
  );

  it.each(['RAW_MATERIAL', 'CONSUMABLE'] as const)('rejects %s', async (type) => {
    await http()
      .post(base)
      .set('Cookie', cookies.get('PRODUCCION')!)
      .send(await payload({ type }))
      .expect(422);
  });

  it('rejects inactive/missing product and duplicate product/code', async () => {
    await http()
      .post(base)
      .set('Cookie', cookies.get('PRODUCCION')!)
      .send(await payload({ isActive: false }))
      .expect(422);

    const input = await payload();

    await http()
      .post(base)
      .set('Cookie', cookies.get('PRODUCCION')!)
      .send({ ...input, productId: randomUUID() })
      .expect(404);

    await http().post(base).set('Cookie', cookies.get('PRODUCCION')!).send(input).expect(201);

    await http()
      .post(base)
      .set('Cookie', cookies.get('PRODUCCION')!)
      .send({ ...input, code: 'OTHER-' + randomUUID().slice(0, 8) })
      .expect(409);

    await http()
      .post(base)
      .set('Cookie', cookies.get('PRODUCCION')!)
      .send({ ...input, productId: (await product()).id })
      .expect(409);
  });

  it('rejects product reassignment, missing route, malformed bodies and negative/duplicate sequences', async () => {
    const route = await create();

    await http()
      .patch(base + '/' + route.id)
      .set('Cookie', cookies.get('ADMIN')!)
      .send({ productId: randomUUID() })
      .expect(400);

    await http()
      .get(base + '/' + randomUUID())
      .set('Cookie', cookies.get('ADMIN')!)
      .expect(404);

    for (const change of [
      { name: ' ' },
      { code: ' ' },
      { operations: [] },
      { operations: [{ ...ops[0], sequence: 0 }] },
      { operations: [ops[0], ops[0]] },
      { operations: [{ ...ops[0], standardMinutes: '0' }] },
    ])
      await http()
        .post(base)
        .set('Cookie', cookies.get('ADMIN')!)
        .send({ ...(await payload()), ...change })
        .expect(400);
  });

  it('rolls back creation and operation replacement when audit fails', async () => {
    const route = await create();
    const input = await payload();

    vi.spyOn(kit.app.get(AuditService), 'record').mockRejectedValue(
      new Error('Injected audit failure'),
    );

    await http().post(base).set('Cookie', cookies.get('ADMIN')!).send(input).expect(500);

    expect(
      await kit.prisma.productionRoute.findUnique({ where: { productId: input.productId } }),
    ).toBeNull();

    await http()
      .put(base + '/' + route.id + '/operations')
      .set('Cookie', cookies.get('ADMIN')!)
      .send({ operations: [ops[0]] })
      .expect(500);

    const current = data(
      await http()
        .get(base + '/' + route.id)
        .set('Cookie', cookies.get('ADMIN')!)
        .expect(200),
    );
    expect(current).toEqual(route);
  });

  it('enforces SQL constraints without DTO/service', async () => {
    const route = await create();

    await expect(
      kit.prisma.routeOperation.create({
        data: { routeId: route.id, sequence: 0, name: 'Invalid', standardMinutes: '1' },
      }),
    ).rejects.toThrow();

    await expect(
      kit.prisma.routeOperation.create({
        data: { routeId: route.id, sequence: 10, name: 'Duplicate', standardMinutes: '1' },
      }),
    ).rejects.toThrow();

    await expect(
      kit.prisma.routeOperation.create({
        data: { routeId: route.id, sequence: 99, name: 'Invalid', standardMinutes: '0' },
      }),
    ).rejects.toThrow();
  });

  it('checks product validity on reactivation and preserves operations on deactivation', async () => {
    const route = await create();
    await kit.prisma.product.update({ where: { id: route.productId }, data: { isActive: false } });

    await http()
      .patch(base + '/' + route.id + '/status')
      .set('Cookie', cookies.get('ADMIN')!)
      .send({ isActive: false })
      .expect(200);

    await http()
      .patch(base + '/' + route.id + '/status')
      .set('Cookie', cookies.get('ADMIN')!)
      .send({ isActive: true })
      .expect(422);

    expect(await kit.prisma.routeOperation.count({ where: { routeId: route.id } })).toBe(5);
  });

  it('serializes concurrent replacements under the route row lock', async () => {
    const route = await create();
    const operations = [{ sequence: 1, name: 'A', standardMinutes: '1.00' }];

    const results = await Promise.all(
      [operations, [{ ...operations[0], name: 'B' }]].map((value) =>
        http()
          .put(base + '/' + route.id + '/operations')
          .set('Cookie', cookies.get('ADMIN')!)
          .send({ operations: value }),
      ),
    );

    expect(results.map((r) => r.status)).toEqual([200, 200]);

    const logs = await kit.prisma.auditLog.findMany({
      where: { entityId: route.id, action: 'UPDATE' },
      orderBy: { createdAt: 'asc' },
    });

    expect(logs).toHaveLength(2);
    const first = logs.find(
      (log) =>
        Array.isArray((log.previousValues as { operations?: unknown[] })?.operations) &&
        (log.previousValues as { operations: unknown[] }).operations.length === 5,
    )!;
    const second = logs.find((log) => log.id !== first.id)!;
    expect(second.previousValues).toEqual(first.newValues);
  });

  it('requires authentication for reads and ADMIN/PRODUCCION for every mutation', async () => {
    const route = await create();
    await http().get(base).expect(401);
    await http()
      .get(base + '/' + route.id)
      .expect(401);

    for (const role of Object.values(RoleCode)) {
      await http().get(base).set('Cookie', cookies.get(role)!).expect(200);

      if (role === 'ADMIN' || role === 'PRODUCCION') continue;

      await http().post(base).set('Cookie', cookies.get(role)!).send({}).expect(403);

      await http()
        .patch(base + '/' + route.id)
        .set('Cookie', cookies.get(role)!)
        .send({ name: 'No' })
        .expect(403);

      await http()
        .patch(base + '/' + route.id + '/status')
        .set('Cookie', cookies.get(role)!)
        .send({ isActive: false })
        .expect(403);

      await http()
        .put(base + '/' + route.id + '/operations')
        .set('Cookie', cookies.get(role)!)
        .send({ operations: ops })
        .expect(403);
    }

    await http()
      .delete(base + '/' + route.id)
      .set('Cookie', cookies.get('ADMIN')!)
      .expect(404);
  });
});
