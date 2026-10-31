import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProductType, RoleCode, UnitOfMeasure } from '../src/generated/prisma/client.js';
import {
  BOM_GRAPH_LOCK_KEY,
  BomGraphService,
  buildManufacturingGraph,
  findCycle,
} from '../src/production/boms/bom-graph.service.js';
import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';

let kit: TestApp;
let cookie: string;
const base = '/api/production/boms';
type Version = { id: string; version: number; isActive: boolean };
type Product = { id: string; code: string };
type Bom = { id: string; product: Product };
const data = <T>(response: { body: unknown }) => (response.body as { data: T }).data;
const post = (path: string) => kit.http().post(path).set('Cookie', cookie);

async function product(type: ProductType = ProductType.INTERMEDIATE): Promise<Product> {
  return kit.prisma.product.create({
    data: {
      code: 'C4-' + type.slice(0, 3) + '-' + randomUUID().slice(0, 8).toUpperCase(),
      name: 'Producto C4 ' + type,
      category: 'Prueba C4',
      type,
      unit: UnitOfMeasure.GRAM,
      isLotTracked: type === ProductType.INTERMEDIATE || type === ProductType.FINISHED_GOOD,
    },
    select: { id: true, code: true },
  });
}
async function bom(output: Product): Promise<Bom> {
  const created = data<{ id: string }>(
    await post(base)
      .send({ productId: output.id, name: 'C4 ' + output.code })
      .expect(201),
  );
  return { id: created.id, product: output };
}
const version = (target: Bom, components: Product[]) =>
  post(`${base}/${target.id}/versions`).send({
    outputQuantity: '1',
    items: components.map((component) => ({ productId: component.id, quantity: '1' })),
  });
async function createVersion(target: Bom, components: Product[]) {
  return data<Version>(await version(target, components).expect(201));
}
const activate = (target: Bom, versionId: string) =>
  post(`${base}/${target.id}/versions/${versionId}/activate`).send({});
const setStatus = (target: Bom, isActive: boolean) =>
  kit.http().patch(`${base}/${target.id}/status`).set('Cookie', cookie).send({ isActive });
/** Producto con fórmula activa v1 = componentes. */
async function manufactured(components: Product[], type: ProductType = ProductType.INTERMEDIATE) {
  const target = await bom(await product(type));
  const v1 = await createVersion(target, components);
  return { ...target, v1 };
}
function expectCycle(response: { status: number; body: unknown }, path: Product[]) {
  expect(response.status).toBe(422);
  expect(response.body).toEqual({
    statusCode: 422,
    code: 'BOM_CYCLE_DETECTED',
    message: 'La estructura de fabricación contiene un ciclo',
    path: path.map((item) => item.code),
  });
}
/** Ciclo alcanzable desde los productos de la prueba en el grafo activo almacenado. */
async function activeGraphCycle(...roots: Product[]) {
  const rows = await kit.prisma.$transaction((tx) => new BomGraphService().loadActiveRows(tx));
  return findCycle(
    buildManufacturingGraph(rows),
    roots.map((root) => root.id),
  );
}

beforeAll(async () => {
  kit = await createTestApp();
  cookie = await login(kit, await createUser(kit, RoleCode.PRODUCCION));
}, 30000);
afterAll(async () => {
  if (kit) await kit.close();
});

describe('C4: detección de ciclos en la estructura de fabricación', () => {
  it('A → A sigue rechazándose como autorreferencia', async () => {
    const a = await bom(await product());
    const response = await version(a, [a.product]).expect(422);
    expect(response.body).toMatchObject({ code: 'BOM_SELF_REFERENCE' });
  });

  it('A → B, B → A se rechaza con el camino y sin escribir versión ni auditoría', async () => {
    const a = await bom(await product());
    const b = await manufactured([a.product]);
    const audits = await kit.prisma.auditLog.count();
    expectCycle(await version(a, [b.product]), [a.product, b.product, a.product]);
    expect(await kit.prisma.bomVersion.count({ where: { bomId: a.id } })).toBe(0);
    expect(await kit.prisma.auditLog.count()).toBe(audits);
  });

  it('A → B → C → A se rechaza', async () => {
    const a = await bom(await product());
    const c = await manufactured([a.product]);
    const b = await manufactured([c.product]);
    expectCycle(await version(a, [b.product]), [a.product, b.product, c.product, a.product]);
  });

  it('acepta el DAG A → {B, C} → D (dependencia compartida)', async () => {
    const raw = await product(ProductType.RAW_MATERIAL);
    const d = await manufactured([raw]);
    const b = await manufactured([d.product]);
    const c = await manufactured([d.product]);
    const a = await manufactured([b.product, c.product, raw], ProductType.FINISHED_GOOD);
    expect(a.v1.isActive).toBe(true);
    expect(await activeGraphCycle(a.product)).toBeNull();
  });

  it('valida la versión candidata aunque nazca inactiva (createVersion)', async () => {
    const raw = await product(ProductType.RAW_MATERIAL);
    const a = await manufactured([raw]);
    const b = await manufactured([a.product]);
    expectCycle(await version(a, [b.product]), [a.product, b.product, a.product]);
    expect(await kit.prisma.bomVersion.count({ where: { bomId: a.id } })).toBe(1);
  });

  it('vuelve a validar al activar si el catálogo cambió desde la creación', async () => {
    const raw = await product(ProductType.RAW_MATERIAL);
    const a = await manufactured([raw]);
    const b = await manufactured([raw]);
    const aV2 = await createVersion(a, [b.product]);
    expect(aV2.isActive).toBe(false);
    // B cambia después: su v2 usa A, válida mientras A siga en v1.
    const bV2 = await createVersion(b, [a.product]);
    await activate(b, bV2.id).expect(200);
    expectCycle(await activate(a, aV2.id), [a.product, b.product, a.product]);
    const active = await kit.prisma.bomVersion.findFirstOrThrow({
      where: { bomId: a.id, isActive: true },
    });
    expect(active.id).toBe(a.v1.id);
  });

  it('bloquea la reactivación que completa un ciclo y permite siempre desactivar', async () => {
    const raw = await product(ProductType.RAW_MATERIAL);
    const b = await manufactured([raw]);
    const a = await manufactured([b.product]);
    await setStatus(a, false).expect(200);
    const bV2 = await createVersion(b, [a.product]);
    await activate(b, bV2.id).expect(200);
    expectCycle(await setStatus(a, true), [a.product, b.product, a.product]);
    expect(
      (await kit.prisma.billOfMaterial.findUniqueOrThrow({ where: { id: a.id } })).isActive,
    ).toBe(false);
    await setStatus(b, false).expect(200);
    await setStatus(a, true).expect(200);
    expect(await activeGraphCycle(a.product, b.product)).toBeNull();
  });

  it('activaciones concurrentes A → B y B → A: entra como máximo una', async () => {
    for (let round = 0; round < 5; round++) {
      const raw = await product(ProductType.RAW_MATERIAL);
      const a = await manufactured([raw]);
      const b = await manufactured([raw]);
      const aV2 = await createVersion(a, [b.product]);
      const bV2 = await createVersion(b, [a.product]);
      const responses = await Promise.all([activate(a, aV2.id), activate(b, bV2.id)]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 422]);
      const rejected = responses.find((response) => response.status === 422)!;
      expect(rejected.body).toMatchObject({ code: 'BOM_CYCLE_DETECTED' });
      const active = await kit.prisma.bomVersion.findMany({
        where: { id: { in: [aV2.id, bV2.id] }, isActive: true },
      });
      expect(active).toHaveLength(1);
      expect(await activeGraphCycle(a.product, b.product)).toBeNull();
    }
  });

  it('el advisory lock serializa mutaciones estructurales sin bloquear lecturas', async () => {
    const raw = await product(ProductType.RAW_MATERIAL);
    const a = await manufactured([raw]);
    const aV2 = await createVersion(a, [raw]);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const acquired = new Promise<void>((resolve) => (locked = resolve));
    const holder = kit.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${BOM_GRAPH_LOCK_KEY}))`;
        locked();
        await held;
      },
      { timeout: 20000 },
    );
    await acquired;
    let settled = false;
    const pending = activate(a, aV2.id).then((response) => {
      settled = true;
      return response;
    });
    // Lecturas y cálculo no toman el lock: responden mientras la mutación espera.
    await kit.http().get(`${base}/${a.id}`).set('Cookie', cookie).expect(200);
    await post(`${base}/${a.id}/versions/${a.v1.id}/calculate`)
      .send({ quantityPlanned: '10' })
      .expect(200);
    await kit
      .http()
      .get(`/api/production/manufacturing-structure/${a.product.id}`)
      .set('Cookie', cookie)
      .expect(200);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(settled).toBe(false);
    release();
    await holder;
    expect((await pending).status).toBe(200);
  });
});
