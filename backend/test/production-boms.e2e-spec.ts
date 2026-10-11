import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service.js';
import {
  ProductType,
  RoleCode,
  UnitOfMeasure,
  type Product,
} from '../src/generated/prisma/client.js';
import {
  createTestApp,
  createUser,
  login,
  type TestApp,
  type TestUser,
} from './support/auth-test-kit.js';

let kit: TestApp;
let actor: TestUser;
const cookies = new Map<RoleCode, string>();
const base = '/api/production/boms';
type Version = {
  id: string;
  version: number;
  outputQuantity: string;
  isActive: boolean;
  items: { quantity: string }[];
};
type Bom = { id: string; name: string; productId: string; isActive: boolean; versions: Version[] };
function data<T>(response: { body: unknown }): T {
  return (response.body as { data: T }).data;
}
function http(role: RoleCode = RoleCode.PRODUCCION) {
  return kit.http().post(base).set('Cookie', cookies.get(role)!);
}
async function product(overrides: Partial<Product> = {}) {
  return kit.prisma.product.create({
    data: {
      code: 'C1-' + randomUUID(),
      name: 'Producto C-1',
      category: 'Prueba',
      type: ProductType.RAW_MATERIAL,
      unit: UnitOfMeasure.GRAM,
      ...overrides,
    },
  });
}
async function fixture() {
  const output = await product({
    type: ProductType.FINISHED_GOOD,
    unit: UnitOfMeasure.UNIT,
    isLotTracked: true,
  });
  const component = await product();
  const bom = data<Bom>(
    await http()
      .send({ name: 'Jabón C-1 ' + randomUUID(), productId: output.id })
      .expect(201),
  );
  const payload = { outputQuantity: '1', items: [{ productId: component.id, quantity: '500' }] };
  return { output, component, bom, payload };
}
async function createVersion(bomId: string, payload: unknown) {
  return data<Version>(
    await kit
      .http()
      .post(base + '/' + bomId + '/versions')
      .set('Cookie', cookies.get(RoleCode.PRODUCCION)!)
      .send(payload)
      .expect(201),
  );
}
beforeAll(async () => {
  kit = await createTestApp();
  for (const role of Object.values(RoleCode)) {
    const user = await createUser(kit, role);
    if (role === RoleCode.PRODUCCION) actor = user;
    cookies.set(role, await login(kit, user));
  }
}, 30000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (kit) await kit.close();
});

describe('C-1: fórmulas versionadas, cálculo y auditoría', () => {
  it('crea una fórmula para cada tipo de salida manufacturable', async () => {
    for (const type of [ProductType.INTERMEDIATE, ProductType.FINISHED_GOOD]) {
      const output = await product({ type, isLotTracked: true });
      const response = await http()
        .send({ name: '  Fórmula de prueba  ', productId: output.id })
        .expect(201);
      expect(data<Bom>(response)).toMatchObject({
        name: 'Fórmula de prueba',
        productId: output.id,
        isActive: true,
        versions: [],
      });
      const audit = await kit.prisma.auditLog.findMany({
        where: { requestId: response.headers['x-request-id'] },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        entityType: 'BILL_OF_MATERIAL',
        action: 'CREATE',
        actorUserId: actor.id,
        newValues: { name: 'Fórmula de prueba' },
      });
    }
  });
  it('crea una versión, calcula 100 unidades y no crea stock, lotes ni secuencias', async () => {
    const f = await fixture();
    const before = await Promise.all([
      kit.prisma.inventoryMovement.count(),
      kit.prisma.stockBalance.count(),
      kit.prisma.lot.count(),
      kit.prisma.documentSequence.count(),
    ]);
    const version = await createVersion(f.bom.id, f.payload);
    expect(version).toMatchObject({
      version: 1,
      outputQuantity: '1.0000',
      isActive: true,
      items: [{ quantity: '500.0000' }],
    });
    const result = await kit
      .http()
      .post(base + '/' + f.bom.id + '/versions/' + version.id + '/calculate')
      .set('Cookie', cookies.get(RoleCode.VENTAS)!)
      .send({ quantityPlanned: '100' })
      .expect(200);
    expect(data<{ quantityPlanned: string; items: unknown[] }>(result)).toMatchObject({
      quantityPlanned: '100.0000',
      items: [{ productId: f.component.id, unit: 'GRAM', requiredQuantity: '50000.0000' }],
    });
    expect(
      await Promise.all([
        kit.prisma.inventoryMovement.count(),
        kit.prisma.stockBalance.count(),
        kit.prisma.lot.count(),
        kit.prisma.documentSequence.count(),
      ]),
    ).toEqual(before);
    expect(
      await kit.prisma.auditLog.findMany({
        where: { requestId: result.headers['x-request-id'] },
      }),
    ).toHaveLength(0);
  });
  it('lista y consulta para todos los roles y restringe las escrituras', async () => {
    const f = await fixture();
    for (const role of Object.values(RoleCode)) {
      await kit.http().get(base).set('Cookie', cookies.get(role)!).expect(200);
      await kit
        .http()
        .get(base + '/' + f.bom.id)
        .set('Cookie', cookies.get(role)!)
        .expect(200);
      const output = await product({ type: ProductType.INTERMEDIATE, isLotTracked: true });
      await http(role)
        .send({ productId: output.id, name: 'RBAC' })
        .expect(role === RoleCode.ADMIN || role === RoleCode.PRODUCCION ? 201 : 403);
    }
    await kit.http().get(base).expect(401);
    await kit.http().post(base).send({ productId: f.output.id, name: 'Sin sesión' }).expect(401);
  });
  it('rechaza fórmula duplicada y salida inexistente, inactiva o no manufacturable', async () => {
    const f = await fixture();
    await http().send({ name: 'Duplicada', productId: f.output.id }).expect(409);
    await http().send({ name: 'No existe', productId: randomUUID() }).expect(404);
    for (const changes of [
      {},
      { type: ProductType.FINISHED_GOOD },
      { type: ProductType.INTERMEDIATE, isLotTracked: true, isActive: false },
    ]) {
      const output = await product(changes);
      await http().send({ name: 'Inválida', productId: output.id }).expect(422);
      expect(await kit.prisma.billOfMaterial.count({ where: { productId: output.id } })).toBe(0);
    }
  });
  it('acepta componente consumible e intermedio sin expandir su fórmula', async () => {
    const f = await fixture();
    const consumable = await product({ type: ProductType.CONSUMABLE });
    const intermediate = await product({
      type: ProductType.INTERMEDIATE,
      unit: UnitOfMeasure.KILOGRAM,
    });
    const v = await createVersion(f.bom.id, {
      outputQuantity: '1',
      items: [
        { productId: consumable.id, quantity: '1' },
        { productId: intermediate.id, quantity: '0.5' },
      ],
    });
    expect(v.items).toHaveLength(2);
  });
  it('rechaza componentes duplicados (incluidas mayúsculas), autorreferencia y tipos inválidos', async () => {
    const f = await fixture();
    const endpoint = base + '/' + f.bom.id + '/versions';
    const send = (value: unknown, status: number) =>
      kit
        .http()
        .post(endpoint)
        .set('Cookie', cookies.get(RoleCode.PRODUCCION)!)
        .send(value)
        .expect(status);
    await send(
      {
        outputQuantity: '1',
        items: [
          { productId: f.component.id, quantity: '1' },
          { productId: f.component.id.toUpperCase(), quantity: '1' },
        ],
      },
      400,
    );
    await send({ outputQuantity: '1', items: [{ productId: f.output.id, quantity: '1' }] }, 422);
    for (const changes of [{ isActive: false }, { type: ProductType.FINISHED_GOOD }]) {
      const component = await product(changes);
      await send({ outputQuantity: '1', items: [{ productId: component.id, quantity: '1' }] }, 422);
    }
    await send({ outputQuantity: '1', items: [{ productId: randomUUID(), quantity: '1' }] }, 404);
  });
  it.each([1, null, '-1', '1.00001', '100000000000000', '1e2', 'NaN'])(
    'rechaza cantidad HTTP inválida %s sin coerción',
    async (quantity) => {
      const f = await fixture();
      await kit
        .http()
        .post(base + '/' + f.bom.id + '/versions')
        .set('Cookie', cookies.get(RoleCode.PRODUCCION)!)
        .send({ ...f.payload, outputQuantity: quantity })
        .expect(400);
    },
  );
  it('rechaza cero, items vacíos/null y campos extra', async () => {
    const f = await fixture();
    const endpoint = base + '/' + f.bom.id + '/versions';
    for (const value of [
      { ...f.payload, items: [] },
      { ...f.payload, items: [null] },
      { ...f.payload, items: [[]] },
      { ...f.payload, unit: 'GRAM' },
    ]) {
      await kit
        .http()
        .post(endpoint)
        .set('Cookie', cookies.get(RoleCode.PRODUCCION)!)
        .send(value)
        .expect(400);
    }
    await kit
      .http()
      .post(endpoint)
      .set('Cookie', cookies.get(RoleCode.PRODUCCION)!)
      .send({ ...f.payload, outputQuantity: '0' })
      .expect(422);
  });
  it('serializa creación concurrente y activación con una sola versión activa', async () => {
    const f = await fixture();
    const versions = await Promise.all([
      createVersion(f.bom.id, f.payload),
      createVersion(f.bom.id, f.payload),
      createVersion(f.bom.id, f.payload),
    ]);
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2, 3]);
    expect(versions.filter((v) => v.isActive)).toHaveLength(1);
    await Promise.all(
      versions
        .filter((v) => !v.isActive)
        .map((v) =>
          kit
            .http()
            .post(base + '/' + f.bom.id + '/versions/' + v.id + '/activate')
            .set('Cookie', cookies.get(RoleCode.PRODUCCION)!)
            .send({})
            .expect(200),
        ),
    );
    expect(await kit.prisma.bomVersion.count({ where: { bomId: f.bom.id, isActive: true } })).toBe(
      1,
    );
    const active = await kit.prisma.bomVersion.findFirstOrThrow({
      where: { bomId: f.bom.id, isActive: true },
    });
    const inactive = versions.find((v) => v.id !== active.id)!;
    await expect(
      kit.prisma.bomVersion.update({ where: { id: inactive.id }, data: { isActive: true } }),
    ).rejects.toThrow();
  });
  it('mantiene el contenido y las unidades de versiones históricas', async () => {
    const f = await fixture();
    const v = await createVersion(f.bom.id, f.payload);
    await expect(
      kit.prisma.bomVersion.update({ where: { id: v.id }, data: { outputQuantity: '2' } }),
    ).rejects.toThrow();
    const item = await kit.prisma.bomItem.findFirstOrThrow({ where: { bomVersionId: v.id } });
    await expect(
      kit.prisma.bomItem.update({ where: { id: item.id }, data: { quantity: '2' } }),
    ).rejects.toThrow();
    await expect(kit.prisma.bomVersion.delete({ where: { id: v.id } })).rejects.toThrow();
    for (const id of [f.output.id, f.component.id]) {
      await kit
        .http()
        .patch('/api/products/' + id)
        .set('Cookie', cookies.get(RoleCode.INVENTARIO)!)
        .send({ unit: 'LITER' })
        .expect(409);
      await kit
        .http()
        .patch('/api/products/' + id)
        .set('Cookie', cookies.get(RoleCode.INVENTARIO)!)
        .send({ type: 'CONSUMABLE' })
        .expect(409);
    }
    await kit
      .http()
      .patch(base + '/' + f.bom.id)
      .set('Cookie', cookies.get(RoleCode.PRODUCCION)!)
      .send({ productId: f.component.id })
      .expect(400);
    await kit
      .http()
      .patch(base + '/' + f.bom.id + '/versions/' + v.id)
      .set('Cookie', cookies.get(RoleCode.PRODUCCION)!)
      .send({ outputQuantity: '2' })
      .expect(404);
    expect(
      (
        await kit.prisma.bomVersion.findUniqueOrThrow({ where: { id: v.id } })
      ).outputQuantity.toFixed(4),
    ).toBe('1.0000');
  });
  it('revierte cabecera y versión si falla la auditoría', async () => {
    const f = await fixture();
    vi.spyOn(kit.app.get(AuditService), 'record').mockRejectedValueOnce(
      new Error('Fallo controlado'),
    );
    await kit
      .http()
      .post(base + '/' + f.bom.id + '/versions')
      .set('Cookie', cookies.get(RoleCode.PRODUCCION)!)
      .send(f.payload)
      .expect(500);
    expect(await kit.prisma.bomVersion.count({ where: { bomId: f.bom.id } })).toBe(0);
    const output = await product({ type: ProductType.INTERMEDIATE, isLotTracked: true });
    vi.spyOn(kit.app.get(AuditService), 'record').mockRejectedValueOnce(
      new Error('Fallo controlado'),
    );
    await http().send({ productId: output.id, name: 'Rollback' }).expect(500);
    expect(await kit.prisma.billOfMaterial.count({ where: { productId: output.id } })).toBe(0);
  });
  it('revierte ambos estados de versión si falla la auditoría de activación', async () => {
    const f = await fixture();
    const previous = await createVersion(f.bom.id, f.payload);
    const next = await createVersion(f.bom.id, f.payload);
    const auditCount = await kit.prisma.auditLog.count({
      where: { entityId: { in: [previous.id, next.id] } },
    });
    vi.spyOn(kit.app.get(AuditService), 'record').mockRejectedValueOnce(
      new Error('Fallo controlado de activación'),
    );
    await kit
      .http()
      .post(base + '/' + f.bom.id + '/versions/' + next.id + '/activate')
      .set('Cookie', cookies.get(RoleCode.PRODUCCION)!)
      .send({})
      .expect(500);
    expect(
      (await kit.prisma.bomVersion.findUniqueOrThrow({ where: { id: previous.id } })).isActive,
    ).toBe(true);
    expect(
      (await kit.prisma.bomVersion.findUniqueOrThrow({ where: { id: next.id } })).isActive,
    ).toBe(false);
    expect(
      await kit.prisma.auditLog.count({ where: { entityId: { in: [previous.id, next.id] } } }),
    ).toBe(auditCount);
  });
  it('bloquea edición concurrente de unidad/tipo mientras se publica una versión', async () => {
    for (const changes of [{ unit: 'LITER' }, { type: 'CONSUMABLE' }]) {
      const f = await fixture();
      let editing: Promise<number> = Promise.resolve(-1);
      await kit.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${f.component.id}::uuid FOR SHARE`;
        editing = kit
          .http()
          .patch('/api/products/' + f.component.id)
          .set('Cookie', cookies.get(RoleCode.INVENTARIO)!)
          .send(changes)
          .then((response) => response.status);
        await vi.waitFor(
          async () => {
            const waiting = await kit.prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT count(*) FROM pg_stat_activity
            WHERE datname = current_database() AND pid <> pg_backend_pid()
              AND wait_event_type = 'Lock' AND query ILIKE '%FOR NO KEY UPDATE%'`;
            expect(waiting[0].count > 0n).toBe(true);
          },
          { timeout: 2500, interval: 25 },
        );
        await createVersion(f.bom.id, f.payload);
      });
      expect(await editing).toBe(409);
      expect(
        await kit.prisma.product.findUniqueOrThrow({ where: { id: f.component.id } }),
      ).toMatchObject({ unit: 'GRAM', type: 'RAW_MATERIAL' });
    }
  });
  it('revalida catálogos y rechaza cálculos no representables y versiones ajenas', async () => {
    const f = await fixture();
    const version = await createVersion(f.bom.id, {
      outputQuantity: '3',
      items: [{ productId: f.component.id, quantity: '1' }],
    });
    const calculate = (id: string, quantityPlanned: unknown, status: number) =>
      kit
        .http()
        .post(base + '/' + f.bom.id + '/versions/' + id + '/calculate')
        .set('Cookie', cookies.get(RoleCode.PRODUCCION)!)
        .send({ quantityPlanned })
        .expect(status);
    await calculate(version.id, '1', 422);
    await calculate(version.id, 3, 400);
    await calculate(randomUUID(), '3', 404);
    await kit.prisma.product.update({ where: { id: f.component.id }, data: { isActive: false } });
    await calculate(version.id, '3', 422);
    await kit
      .http()
      .patch(base + '/' + f.bom.id + '/status')
      .set('Cookie', cookies.get(RoleCode.PRODUCCION)!)
      .send({ isActive: false })
      .expect(200);
    await kit
      .http()
      .post(base + '/' + f.bom.id + '/versions')
      .set('Cookie', cookies.get(RoleCode.PRODUCCION)!)
      .send(f.payload)
      .expect(409);
    await kit
      .http()
      .patch(base + '/' + f.bom.id + '/status')
      .set('Cookie', cookies.get(RoleCode.PRODUCCION)!)
      .send({ isActive: true })
      .expect(422);
  });
});
