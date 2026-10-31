import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma, RoleCode } from '../src/generated/prisma/client.js';
import { CARBON_DISCLAIMER } from '../src/sustainability/sustainability-text.js';
import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';
import { body, completedOrder, tag } from './support/sustainability-fixtures.js';

let kit: TestApp;
let actorId: string;
const cookies = new Map<RoleCode, string>();
const as = (role: RoleCode) => ({
  get: (url: string) => kit.http().get(url).set('Cookie', cookies.get(role)!),
  post: (url: string) => kit.http().post(url).set('Cookie', cookies.get(role)!),
  patch: (url: string) => kit.http().patch(url).set('Cookie', cookies.get(role)!),
  delete: (url: string) => kit.http().delete(url).set('Cookie', cookies.get(role)!),
});
const admin = () => as('ADMIN');
const FACTORS = '/api/sustainability/emission-factors';
const CIRCULAR = '/api/sustainability/circular-materials';
const fp = (orderId: string) => `/api/sustainability/production-orders/${orderId}/footprint`;

type Factor = { id: string; code: string; kgCo2ePerUnit: string; isActive: boolean };
type Activity = {
  id: string;
  category: string;
  source: 'PRODUCTION_CONSUMPTION' | 'MANUAL';
  activityQuantity: string;
  activityUnit: string;
  originalQuantity: string | null;
  originalUnit: string | null;
  emissionFactorId: string;
  factorCodeSnapshot: string;
  factorValueSnapshot: string;
  factorSourceNameSnapshot: string;
  emissionsKgCo2e: string;
  inventoryMovementId: string | null;
  updatedAt: string;
};
type Footprint = {
  id: string;
  status: 'DRAFT' | 'FINALIZED';
  scope: string;
  lotId: string;
  quantityProduced: string;
  outputUnit: string;
  totalKgCo2e: string | null;
  kgCo2ePerOutputUnit: string | null;
  totalsByCategory: Record<string, string>;
  totalKgCo2ePreview: string;
  kgCo2ePerOutputUnitPreview: string;
  missingFactors: { productId: string; code: string; consumedQuantity: string; unit: string }[];
  activities: Activity[];
  circularity: { metricCode: string; quantity: string; reportingUnit: string }[];
  disclaimer: string;
  finalizedAt: string | null;
  boundaryNotes: string | null;
};

const TEST_SOURCE = { sourceName: 'TEST_FIXTURE', sourceReference: 'TEST_FIXTURE' };
async function factor(input: Record<string, unknown>) {
  return body<Factor>(
    await admin()
      .post(FACTORS)
      .send({
        code: 'TEST-' + tag(),
        name: 'Factor de prueba',
        ...TEST_SOURCE,
        ...input,
      })
      .expect(201),
  );
}
const energy = (value = '0.50000000') =>
  factor({
    category: 'ENERGY',
    activityUnit: 'KWH',
    kgCo2ePerUnit: value,
    name: 'TEST electricidad',
  });
const notes =
  'Incluye materias primas consumidas y electricidad registrada manualmente. Excluye distribución, uso y fin de vida.';

beforeAll(async () => {
  kit = await createTestApp();
  for (const role of Object.values(RoleCode)) {
    const user = await createUser(kit, role);
    if (role === 'ADMIN') actorId = user.id;
    cookies.set(role, await login(kit, user));
  }
}, 30000);
afterAll(async () => {
  if (kit) await kit.close();
});

describe('C3 emission factor catalog', () => {
  it('creates, reads, edits and toggles a documented factor with audit', async () => {
    const created = await factor({
      category: 'ENERGY',
      activityUnit: 'KWH',
      kgCo2ePerUnit: '0.48000000',
      sourceYear: 2024,
      notes: '  Valor TEST  ',
    });
    expect(created).toMatchObject({
      kgCo2ePerUnit: '0.48000000',
      isActive: true,
      notes: 'Valor TEST',
    });
    const read = body<Factor>(await as('VENTAS').get(`${FACTORS}/${created.id}`).expect(200));
    expect(read.code).toBe(created.code);
    const listed = await as('PRODUCCION')
      .get(`${FACTORS}?search=${created.code}&category=ENERGY&isActive=true`)
      .expect(200);
    expect((listed.body as { meta: { total: number } }).meta.total).toBe(1);
    const updated = body<Factor & { name: string; sourceName: string }>(
      await admin()
        .patch(`${FACTORS}/${created.id}`)
        .send({
          name: 'Electricidad TEST',
          kgCo2ePerUnit: '0.52000000',
          sourceName: 'TEST_FIXTURE v2',
        })
        .expect(200),
    );
    expect(updated).toMatchObject({ name: 'Electricidad TEST', kgCo2ePerUnit: '0.52000000' });
    for (const identity of [
      { code: 'OTHER' },
      { category: 'WASTE' },
      { activityUnit: 'LITER' },
      { productId: null },
    ])
      await admin().patch(`${FACTORS}/${created.id}`).send(identity).expect(400);
    await admin().patch(`${FACTORS}/${created.id}`).send({ sourceName: '   ' }).expect(400);
    await admin().patch(`${FACTORS}/${created.id}/status`).send({ isActive: false }).expect(200);
    await admin().patch(`${FACTORS}/${created.id}/status`).send({ isActive: false }).expect(409);
    await admin().patch(`${FACTORS}/${created.id}/status`).send({ isActive: true }).expect(200);
    const audit = await kit.prisma.auditLog.findMany({
      where: { entityId: created.id, entityType: 'EMISSION_FACTOR' },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => a.action)).toEqual(['CREATE', 'UPDATE', 'DISABLE', 'ENABLE']);
    expect(audit[1].previousValues).toMatchObject({ kgCo2ePerUnit: '0.48000000' });
    expect(audit[1].newValues).toMatchObject({ kgCo2ePerUnit: '0.52000000' });
  });

  it('enforces duplicates, one active factor per product and unit compatibility', async () => {
    const created = await energy();
    await admin()
      .post(FACTORS)
      .send({
        code: created.code.toLowerCase(),
        name: 'Dup',
        category: 'ENERGY',
        activityUnit: 'KWH',
        kgCo2ePerUnit: '1',
        ...TEST_SOURCE,
      })
      .expect(409);
    const grams = await kit.prisma.product.create({
      data: {
        code: 'C3-G-' + tag(),
        name: 'Soda TEST',
        category: 'C3',
        type: 'RAW_MATERIAL',
        unit: 'GRAM',
      },
    });
    const liters = await kit.prisma.product.create({
      data: {
        code: 'C3-L-' + tag(),
        name: 'Aceite TEST',
        category: 'C3',
        type: 'RAW_MATERIAL',
        unit: 'LITER',
      },
    });
    const raw = (productId: string, activityUnit = 'KILOGRAM', category = 'RAW_MATERIAL') =>
      admin()
        .post(FACTORS)
        .send({
          code: 'TEST-' + tag(),
          name: 'MP',
          category,
          activityUnit,
          kgCo2ePerUnit: '2',
          productId,
          ...TEST_SOURCE,
        });
    const first = body<Factor>(await raw(grams.id).expect(201));
    await raw(grams.id).expect(409);
    await raw(liters.id).expect(422);
    await raw(liters.id, 'UNIT').expect(422);
    await raw(grams.id, 'KWH', 'ENERGY').expect(422);
    await raw('00000000-0000-7000-8000-000000000000').expect(404);
    await admin().patch(`${FACTORS}/${first.id}/status`).send({ isActive: false }).expect(200);
    const second = body<Factor>(await raw(grams.id, 'GRAM').expect(201));
    await admin().patch(`${FACTORS}/${first.id}/status`).send({ isActive: true }).expect(409);
    expect(
      await kit.prisma.emissionFactor.count({ where: { productId: grams.id, isActive: true } }),
    ).toBe(1);
    expect(second.isActive).toBe(true);
    const byProduct = await as('INVENTARIO').get(`${FACTORS}?productId=${grams.id}`).expect(200);
    expect((byProduct.body as { meta: { total: number } }).meta.total).toBe(2);
  });

  it('rejects negative and anonymous factors in API and PostgreSQL', async () => {
    const base = {
      code: 'TEST-' + tag(),
      name: 'N',
      category: 'WASTE',
      activityUnit: 'KILOGRAM',
      ...TEST_SOURCE,
    };
    await admin()
      .post(FACTORS)
      .send({ ...base, kgCo2ePerUnit: '-0.1' })
      .expect(400);
    await admin()
      .post(FACTORS)
      .send({ ...base, kgCo2ePerUnit: 0.5 })
      .expect(400);
    await admin()
      .post(FACTORS)
      .send({ ...base, kgCo2ePerUnit: '1', sourceReference: '  ' })
      .expect(400);
    await admin()
      .post(FACTORS)
      .send({ ...base, kgCo2ePerUnit: '1', category: 'OTHER' })
      .expect(400);
    const zero = body<Factor>(
      await admin()
        .post(FACTORS)
        .send({ ...base, kgCo2ePerUnit: '0' })
        .expect(201),
    );
    expect(zero.kgCo2ePerUnit).toBe('0.00000000');
    const insert = (value: string, sourceName: string) =>
      kit.prisma
        .$executeRaw`INSERT INTO emission_factors (id, code, name, category, activity_unit, kg_co2e_per_unit, source_name, source_reference, created_by_user_id, updated_at)
        VALUES (gen_random_uuid(), ${'TEST-' + tag()}, 'Raw', 'WASTE', 'KILOGRAM', ${value}::numeric, ${sourceName}, 'TEST_FIXTURE', ${actorId}::uuid, now())`;
    await expect(insert('-1', 'TEST_FIXTURE')).rejects.toThrow(/emission_factors_value_check/);
    await expect(insert('1', ' \t ')).rejects.toThrow(/emission_factors_source_check/);
  });

  it('keeps factor mutations ADMIN-only and reads authenticated', async () => {
    const created = await energy();
    for (const role of ['PRODUCCION', 'COMPRAS', 'INVENTARIO', 'VENTAS'] as const) {
      await as(role)
        .post(FACTORS)
        .send({
          code: 'TEST-' + tag(),
          name: 'x',
          category: 'ENERGY',
          activityUnit: 'KWH',
          kgCo2ePerUnit: '1',
          ...TEST_SOURCE,
        })
        .expect(403);
      await as(role).patch(`${FACTORS}/${created.id}`).send({ kgCo2ePerUnit: '9' }).expect(403);
      await as(role).patch(`${FACTORS}/${created.id}/status`).send({ isActive: false }).expect(403);
      await as(role).get(FACTORS).expect(200);
    }
    await kit.http().get(FACTORS).expect(401);
  });
});

describe('C3 production footprint from the inventory ledger', () => {
  it('derives one activity per PRODUCTION_CONSUMPTION movement, not from the BOM', async () => {
    const f = await completedOrder(kit, cookies.get('ADMIN')!, actorId, {
      components: [
        { unit: 'GRAM', perUnit: '3.5', name: 'Soda cáustica TEST' },
        { unit: 'KILOGRAM', perUnit: '0.05', lotTracked: true, name: 'Glicerina TEST' },
      ],
      planned: '200',
      // Producido < planificado: la BOM × producido daría 525 g; el ledger registra 700 g.
      produced: '150',
    });
    const [soda, glycerin] = f.components;
    // Una nueva versión de BOM tras completar no cambia lo ya consumido.
    await kit.prisma.bomItem.updateMany({ where: { bomVersionId: f.bomVersionId }, data: {} });
    const movements = await kit.prisma.inventoryMovement.findMany({
      where: { productionOrderId: f.order.id, type: 'PRODUCTION_CONSUMPTION' },
      orderBy: { id: 'asc' },
    });
    expect(movements).toHaveLength(3);
    expect(body(await admin().get(fp(f.order.id)).expect(200))).toBeNull();
    expect(
      await kit.prisma.productionFootprint.count({ where: { productionOrderId: f.order.id } }),
    ).toBe(0);
    const sodaFactor = await factor({
      category: 'RAW_MATERIAL',
      activityUnit: 'KILOGRAM',
      kgCo2ePerUnit: '2.10000000',
      productId: soda.product.id,
      sourceYear: 2023,
    });
    const glyFactor = await factor({
      category: 'RAW_MATERIAL',
      activityUnit: 'KILOGRAM',
      kgCo2ePerUnit: '1.00000000',
      productId: glycerin.product.id,
    });
    const created = body<Footprint>(await as('PRODUCCION').post(fp(f.order.id)).expect(201));
    await admin().post(fp(f.order.id)).expect(409);
    expect(created).toMatchObject({
      status: 'DRAFT',
      scope: 'PARTIAL_CRADLE_TO_GATE',
      lotId: f.lotId,
      quantityProduced: '150.0000',
      outputUnit: 'UNIT',
      totalKgCo2e: null,
      missingFactors: [],
      disclaimer: CARBON_DISCLAIMER,
    });
    expect(created.activities).toHaveLength(3);
    expect(created.activities.every((a) => a.source === 'PRODUCTION_CONSUMPTION')).toBe(true);
    expect(created.activities.map((a) => a.inventoryMovementId).sort()).toEqual(
      movements.map((m) => m.id).sort(),
    );
    const sodaActivity = created.activities.find((a) => a.emissionFactorId === sodaFactor.id)!;
    const sodaMovement = movements.find((m) => m.productId === soda.product.id)!;
    expect(sodaActivity).toMatchObject({
      inventoryMovementId: sodaMovement.id,
      originalQuantity: '700.0000',
      originalUnit: 'GRAM',
      activityQuantity: '0.70000000',
      activityUnit: 'KILOGRAM',
      factorCodeSnapshot: sodaFactor.code,
      factorValueSnapshot: '2.10000000',
      factorSourceNameSnapshot: 'TEST_FIXTURE',
      emissionsKgCo2e: '1.47000000',
    });
    const glyActivities = created.activities.filter((a) => a.emissionFactorId === glyFactor.id);
    expect(glyActivities.map((a) => a.originalQuantity)).toEqual(['5.0000', '5.0000']);
    expect(created.totalsByCategory.RAW_MATERIAL).toBe('11.47000000');
    expect(created.totalKgCo2ePreview).toBe('11.47000000');
    // 11.47 / 150 = 0.0764666…, redondeado ROUND_HALF_UP a 8 decimales.
    expect(created.kgCo2ePerOutputUnitPreview).toBe('0.07646667');
    // Resincronizar sin cambios no duplica (inventoryMovementId UNIQUE).
    const synced = body<Footprint>(
      await admin()
        .post(fp(f.order.id) + '/sync')
        .expect(200),
    );
    expect(synced.activities.map((a) => a.id).sort()).toEqual(
      created.activities.map((a) => a.id).sort(),
    );
    await expect(
      kit.prisma.carbonActivity.create({
        data: {
          ...(await kit.prisma.carbonActivity.findUniqueOrThrow({
            where: { id: sodaActivity.id },
          })),
          id: undefined,
        },
      }),
    ).rejects.toThrow();
    const audit = await kit.prisma.auditLog.findMany({ where: { entityId: created.id } });
    expect(audit.map((a) => a.action).sort()).toEqual(['CREATE', 'UPDATE']);
  });

  it('only creates footprints for completed orders and never through GET', async () => {
    const f = await completedOrder(kit, cookies.get('ADMIN')!, actorId, {
      components: [{ unit: 'KILOGRAM', perUnit: '1' }],
      planned: '10',
      complete: false,
    });
    await admin().post(fp(f.order.id)).expect(422);
    await admin().get(fp('00000000-0000-7000-8000-000000000000')).expect(404);
    await admin().post(fp('00000000-0000-7000-8000-000000000000')).expect(404);
    await as('VENTAS').post(fp(f.order.id)).expect(403);
    await as('INVENTARIO')
      .post(fp(f.order.id) + '/sync')
      .expect(403);
    await admin()
      .post(fp(f.order.id) + '/sync')
      .expect(404);
    const summary = body<{ footprint: null; canCreateFootprint: boolean }>(
      await as('VENTAS').get(`/api/sustainability/production-orders/${f.order.id}`).expect(200),
    );
    expect(summary).toMatchObject({ footprint: null, canCreateFootprint: false });
  });

  it('reports missing factors and blocks finalization until configured', async () => {
    const f = await completedOrder(kit, cookies.get('ADMIN')!, actorId, {
      components: [
        { unit: 'KILOGRAM', perUnit: '0.05' },
        { unit: 'GRAM', perUnit: '3.5', name: 'Soda faltante TEST' },
      ],
    });
    const [base, soda] = f.components;
    await factor({
      category: 'RAW_MATERIAL',
      activityUnit: 'KILOGRAM',
      kgCo2ePerUnit: '2',
      productId: base.product.id,
    });
    const draft = body<Footprint>(await admin().post(fp(f.order.id)).expect(201));
    expect(draft.missingFactors).toEqual([
      {
        productId: soda.product.id,
        code: soda.product.code,
        name: 'Soda faltante TEST',
        unit: 'GRAM',
        consumedQuantity: '700.0000',
      },
    ]);
    expect(draft.activities).toHaveLength(1);
    const blocked = await admin()
      .post(fp(f.order.id) + '/finalize')
      .send({ boundaryNotes: notes })
      .expect(422);
    expect((blocked.body as { code: string; missingFactors: unknown[] }).code).toBe(
      'MISSING_EMISSION_FACTORS',
    );
    expect((blocked.body as { missingFactors: unknown[] }).missingFactors).toHaveLength(1);
    expect(
      (await kit.prisma.productionFootprint.findUniqueOrThrow({ where: { id: draft.id } })).status,
    ).toBe('DRAFT');
    await factor({
      category: 'RAW_MATERIAL',
      activityUnit: 'KILOGRAM',
      kgCo2ePerUnit: '1',
      productId: soda.product.id,
    });
    const synced = body<Footprint>(
      await as('PRODUCCION')
        .post(fp(f.order.id) + '/sync')
        .expect(200),
    );
    expect(synced.missingFactors).toEqual([]);
    expect(synced.totalKgCo2ePreview).toBe('20.70000000');
    const done = body<Footprint>(
      await admin()
        .post(fp(f.order.id) + '/finalize')
        .send({ boundaryNotes: notes })
        .expect(200),
    );
    expect(done).toMatchObject({ status: 'FINALIZED', totalKgCo2e: '20.70000000' });
  });

  it('finalization re-reads the ledger: a deactivated factor becomes missing', async () => {
    const f = await completedOrder(kit, cookies.get('ADMIN')!, actorId, {
      components: [{ unit: 'KILOGRAM', perUnit: '0.05' }],
    });
    const raw = await factor({
      category: 'RAW_MATERIAL',
      activityUnit: 'KILOGRAM',
      kgCo2ePerUnit: '2',
      productId: f.components[0].product.id,
    });
    expect(body<Footprint>(await admin().post(fp(f.order.id)).expect(201)).missingFactors).toEqual(
      [],
    );
    await admin().patch(`${FACTORS}/${raw.id}/status`).send({ isActive: false }).expect(200);
    await admin()
      .post(fp(f.order.id) + '/finalize')
      .send({ boundaryNotes: notes })
      .expect(422);
    const after = body<Footprint>(await admin().get(fp(f.order.id)).expect(200));
    expect(after.status).toBe('DRAFT');
    expect(after.activities).toHaveLength(1);
  });
});

describe('C3 draft missing factors follow the active catalog', () => {
  it('reports an inactive factor in DRAFT even with a historical activity, and never in FINALIZED', async () => {
    // 1–4: MP-A con factor activo, OP real completada y su PRODUCTION_CONSUMPTION.
    const f = await completedOrder(kit, cookies.get('ADMIN')!, actorId, {
      components: [{ unit: 'KILOGRAM', perUnit: '0.5', name: 'Materia prima A' }],
    });
    const mpA = f.components[0].product;
    const movements = await kit.prisma.inventoryMovement.findMany({
      where: { productionOrderId: f.order.id, type: 'PRODUCTION_CONSUMPTION' },
    });
    expect(movements.map((m) => m.quantity.toFixed(4))).toEqual(['-100.0000']);
    const raw = await factor({
      category: 'RAW_MATERIAL',
      activityUnit: 'KILOGRAM',
      kgCo2ePerUnit: '0.50000000',
      productId: mpA.id,
      sourceName: 'TEST_FIXTURE A',
      sourceReference: 'TEST_FIXTURE ref A',
    });
    const expectedMissing = [
      {
        productId: mpA.id,
        code: mpA.code,
        name: 'Materia prima A',
        unit: 'KILOGRAM',
        consumedQuantity: '100.0000',
      },
    ];
    const activities = () =>
      kit.prisma.carbonActivity.findMany({
        where: { footprint: { productionOrderId: f.order.id } },
        orderBy: { id: 'asc' },
      });

    // 5–7: DRAFT sin faltantes y con la actividad automática del movimiento.
    await admin().post(fp(f.order.id)).expect(201);
    const draft = body<Footprint>(await admin().get(fp(f.order.id)).expect(200));
    expect(draft.missingFactors).toEqual([]);
    expect(draft.activities).toHaveLength(1);
    expect(draft.activities[0]).toMatchObject({
      source: 'PRODUCTION_CONSUMPTION',
      inventoryMovementId: movements[0].id,
      factorValueSnapshot: '0.50000000',
      emissionsKgCo2e: '50.00000000',
    });

    // 8–9: el snapshot histórico no oculta que hoy no hay factor activo; GET no escribe.
    await admin().patch(`${FACTORS}/${raw.id}/status`).send({ isActive: false }).expect(200);
    const rowsBefore = await activities();
    const inactive = body<Footprint>(await as('PRODUCCION').get(fp(f.order.id)).expect(200));
    expect(inactive.status).toBe('DRAFT');
    expect(inactive.missingFactors).toEqual(expectedMissing);
    expect(inactive.activities.map((a) => a.id)).toEqual(draft.activities.map((a) => a.id));
    expect(await activities()).toEqual(rowsBefore);

    // 10–11: finalize falla con 422, hace rollback y GET sigue mostrando el faltante.
    const blocked = await admin()
      .post(fp(f.order.id) + '/finalize')
      .send({ boundaryNotes: notes })
      .expect(422);
    expect((blocked.body as { code: string }).code).toBe('MISSING_EMISSION_FACTORS');
    expect(await activities()).toEqual(rowsBefore);
    const afterRollback = body<Footprint>(await admin().get(fp(f.order.id)).expect(200));
    expect(afterRollback.status).toBe('DRAFT');
    expect(afterRollback.missingFactors).toEqual(expectedMissing);

    // 12: sync reconcilia la actividad obsoleta sin crear otra y conserva el faltante.
    const synced = body<Footprint>(
      await admin()
        .post(fp(f.order.id) + '/sync')
        .expect(200),
    );
    expect(synced.activities).toEqual([]);
    expect(synced.missingFactors).toEqual(expectedMissing);
    expect(await activities()).toEqual([]);

    // 13–16: reactivar, sync, sin faltantes y finalize 200.
    await admin().patch(`${FACTORS}/${raw.id}/status`).send({ isActive: true }).expect(200);
    const restored = body<Footprint>(
      await admin()
        .post(fp(f.order.id) + '/sync')
        .expect(200),
    );
    expect(restored.activities).toHaveLength(1);
    expect(body<Footprint>(await admin().get(fp(f.order.id)).expect(200)).missingFactors).toEqual(
      [],
    );
    const done = body<Footprint>(
      await admin()
        .post(fp(f.order.id) + '/finalize')
        .send({ boundaryNotes: notes })
        .expect(200),
    );
    expect(done).toMatchObject({
      status: 'FINALIZED',
      totalKgCo2e: '50.00000000',
      missingFactors: [],
    });

    // 17–18: desactivar/editar el factor no invalida la huella finalizada ni sus snapshots.
    const frozenRows = await activities();
    await admin()
      .patch(`${FACTORS}/${raw.id}`)
      .send({ kgCo2ePerUnit: '0.90000000', sourceName: 'Otra fuente', sourceReference: 'Otra ref' })
      .expect(200);
    await admin().patch(`${FACTORS}/${raw.id}/status`).send({ isActive: false }).expect(200);
    const finalized = body<Footprint>(await as('VENTAS').get(fp(f.order.id)).expect(200));
    expect(finalized.status).toBe('FINALIZED');
    expect(finalized.missingFactors).toEqual([]);
    expect(finalized.totalKgCo2e).toBe('50.00000000');
    expect(finalized.activities[0]).toMatchObject({
      factorValueSnapshot: '0.50000000',
      factorSourceNameSnapshot: 'TEST_FIXTURE A',
      factorSourceReferenceSnapshot: 'TEST_FIXTURE ref A',
      emissionsKgCo2e: '50.00000000',
    });
    expect(await activities()).toEqual(frozenRows);
  });
});

describe('C3 manual activities, snapshots and finalization', () => {
  async function draft(perUnit = '0.05') {
    const f = await completedOrder(kit, cookies.get('ADMIN')!, actorId, {
      components: [{ unit: 'KILOGRAM', perUnit }],
    });
    const raw = await factor({
      category: 'RAW_MATERIAL',
      activityUnit: 'KILOGRAM',
      kgCo2ePerUnit: '2.00000000',
      productId: f.components[0].product.id,
    });
    body<Footprint>(await admin().post(fp(f.order.id)).expect(201));
    return { ...f, raw };
  }
  const add = (
    orderId: string,
    emissionFactorId: string,
    quantity: string,
    role: RoleCode = 'PRODUCCION',
  ) =>
    as(role)
      .post(fp(orderId) + '/activities')
      .send({ emissionFactorId, description: 'Electricidad del proceso', quantity });

  it('computes 5 kWh × 0.5 = 2.50000000 exactly and supports every manual category', async () => {
    const f = await draft();
    const kwh = await energy('0.50000000');
    const added = body<Footprint>(await add(f.order.id, kwh.id, '5.00000000').expect(201));
    const manual = added.activities.find((a) => a.source === 'MANUAL')!;
    expect(manual).toMatchObject({
      category: 'ENERGY',
      activityUnit: 'KWH',
      activityQuantity: '5.00000000',
      emissionsKgCo2e: '2.50000000',
      originalQuantity: null,
      inventoryMovementId: null,
    });
    const extra = [
      await factor({
        category: 'INBOUND_TRANSPORT',
        activityUnit: 'TON_KILOMETER',
        kgCo2ePerUnit: '0.10000000',
      }),
      await factor({ category: 'PACKAGING', activityUnit: 'UNIT', kgCo2ePerUnit: '0.01000000' }),
      await factor({ category: 'WASTE', activityUnit: 'KILOGRAM', kgCo2ePerUnit: '0.30000000' }),
    ];
    for (const item of extra) await add(f.order.id, item.id, '1').expect(201);
    const all = body<Footprint>(await admin().get(fp(f.order.id)).expect(200));
    expect(all.totalsByCategory).toEqual({
      RAW_MATERIAL: '20.00000000',
      ENERGY: '2.50000000',
      INBOUND_TRANSPORT: '0.10000000',
      PACKAGING: '0.01000000',
      WASTE: '0.30000000',
    });
    // La unidad viene del factor: el cliente no puede enviarla.
    await as('PRODUCCION')
      .post(fp(f.order.id) + '/activities')
      .send({ emissionFactorId: kwh.id, description: 'x', quantity: '1', activityUnit: 'LITER' })
      .expect(400);
    await add(f.order.id, kwh.id, '0').expect(400);
    await add(f.order.id, kwh.id, '-1').expect(400);
    await add(f.order.id, kwh.id, '1', 'VENTAS').expect(403);
    await add(f.order.id, f.raw.id, '1').expect(422);
    const inactive = await energy();
    await admin().patch(`${FACTORS}/${inactive.id}/status`).send({ isActive: false }).expect(200);
    await add(f.order.id, inactive.id, '1').expect(422);
    await add(f.order.id, '00000000-0000-7000-8000-000000000000', '1').expect(404);
  });

  it('edits and deletes only MANUAL activities, keeping factor snapshots historical', async () => {
    const f = await draft();
    const kwh = await energy('0.50000000');
    const added = body<Footprint>(await add(f.order.id, kwh.id, '5').expect(201));
    const manual = added.activities.find((a) => a.source === 'MANUAL')!;
    const auto = added.activities.find((a) => a.source === 'PRODUCTION_CONSUMPTION')!;
    await admin().patch(`${FACTORS}/${kwh.id}`).send({ kgCo2ePerUnit: '0.75000000' }).expect(200);
    await admin().patch(`${FACTORS}/${f.raw.id}`).send({ kgCo2ePerUnit: '3.00000000' }).expect(200);
    const kept = body<Footprint>(await admin().get(fp(f.order.id)).expect(200));
    expect(kept.activities.find((a) => a.id === manual.id)).toMatchObject({
      factorValueSnapshot: '0.50000000',
      emissionsKgCo2e: '2.50000000',
    });
    expect(kept.activities.find((a) => a.id === auto.id)).toMatchObject({
      factorValueSnapshot: '2.00000000',
      emissionsKgCo2e: '20.00000000',
    });
    const patched = body<Footprint>(
      await as('PRODUCCION')
        .patch(`${fp(f.order.id)}/activities/${manual.id}`)
        .send({ quantity: '6', description: 'Electricidad corregida' })
        .expect(200),
    );
    expect(patched.activities.find((a) => a.id === manual.id)).toMatchObject({
      factorValueSnapshot: '0.50000000',
      emissionsKgCo2e: '3.00000000',
    });
    // Una sincronización DRAFT toma el snapshot actualizado de las automáticas, no de las manuales.
    const synced = body<Footprint>(
      await admin()
        .post(fp(f.order.id) + '/sync')
        .expect(200),
    );
    expect(synced.activities.find((a) => a.id === auto.id)).toMatchObject({
      factorValueSnapshot: '3.00000000',
      emissionsKgCo2e: '30.00000000',
    });
    expect(synced.activities.find((a) => a.id === manual.id)?.factorValueSnapshot).toBe(
      '0.50000000',
    );
    const resnapshot = body<Footprint>(
      await admin()
        .patch(`${fp(f.order.id)}/activities/${manual.id}`)
        .send({ emissionFactorId: kwh.id })
        .expect(200),
    );
    expect(resnapshot.activities.find((a) => a.id === manual.id)).toMatchObject({
      factorValueSnapshot: '0.75000000',
      emissionsKgCo2e: '4.50000000',
    });
    await admin()
      .patch(`${fp(f.order.id)}/activities/${auto.id}`)
      .send({ quantity: '1' })
      .expect(422);
    await admin()
      .delete(`${fp(f.order.id)}/activities/${auto.id}`)
      .expect(422);
    await admin()
      .patch(`${fp(f.order.id)}/activities/${manual.id}`)
      .send({})
      .expect(422);
    await as('COMPRAS')
      .delete(`${fp(f.order.id)}/activities/${manual.id}`)
      .expect(403);
    const removed = body<Footprint>(
      await as('PRODUCCION')
        .delete(`${fp(f.order.id)}/activities/${manual.id}`)
        .expect(200),
    );
    expect(removed.activities.map((a) => a.id)).toEqual([auto.id]);
    const audit = await kit.prisma.auditLog.findMany({
      where: { entityId: manual.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => a.action)).toEqual(['CREATE', 'UPDATE', 'UPDATE', 'DELETE']);
    expect(audit[3].previousValues).toMatchObject({ factorValueSnapshot: '0.75000000' });
  });

  it('finalizes RAW 20 + ENERGY 2.5 = 22.5 kg CO2e and 0.1125 per UNIT, then stays immutable', async () => {
    const f = await draft('0.05');
    const kwh = await energy('0.50000000');
    const added = body<Footprint>(await add(f.order.id, kwh.id, '5.00000000').expect(201));
    const manual = added.activities.find((a) => a.source === 'MANUAL')!;
    await admin()
      .post(fp(f.order.id) + '/finalize')
      .send({ boundaryNotes: '   corto   ' })
      .expect(400);
    await admin()
      .post(fp(f.order.id) + '/finalize')
      .send({})
      .expect(400);
    await as('VENTAS')
      .post(fp(f.order.id) + '/finalize')
      .send({ boundaryNotes: notes })
      .expect(403);
    const done = body<Footprint & { finalizedBy: { id: string } }>(
      await as('PRODUCCION')
        .post(fp(f.order.id) + '/finalize')
        .send({ boundaryNotes: `  ${notes}  ` })
        .expect(200),
    );
    expect(done).toMatchObject({
      status: 'FINALIZED',
      totalKgCo2e: '22.50000000',
      totalKgCo2ePreview: '22.50000000',
      quantityProduced: '200.0000',
      outputUnit: 'UNIT',
      kgCo2ePerOutputUnit: '0.11250000',
      boundaryNotes: notes,
      disclaimer: CARBON_DISCLAIMER,
    });
    expect(done.totalsByCategory).toMatchObject({
      RAW_MATERIAL: '20.00000000',
      ENERGY: '2.50000000',
    });
    const row = await kit.prisma.productionFootprint.findUniqueOrThrow({ where: { id: done.id } });
    expect(row.totalKgCo2e.toFixed(8)).toBe('22.50000000');
    expect(row.kgCo2ePerOutputUnit?.toFixed(8)).toBe('0.11250000');
    expect(row.calculatedAt).not.toBeNull();
    const audit = await kit.prisma.auditLog.findMany({
      where: { entityId: done.id, action: 'FINALIZE_CARBON_FOOTPRINT' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].newValues).toMatchObject({
      productionOrderId: f.order.id,
      lotId: f.lotId,
      scope: 'PARTIAL_CRADLE_TO_GATE',
      totalKgCo2e: '22.50000000',
      quantityProduced: '200.0000',
      outputUnit: 'UNIT',
      kgCo2ePerOutputUnit: '0.11250000',
      boundaryNotes: notes,
      activityCount: 2,
      totalsByCategory: {
        RAW_MATERIAL: '20.00000000',
        ENERGY: '2.50000000',
        INBOUND_TRANSPORT: '0.00000000',
        PACKAGING: '0.00000000',
        WASTE: '0.00000000',
      },
      missingFactors: [],
      finalizedByUserId: done.finalizedBy.id,
      finalizedAt: row.finalizedAt?.toISOString(),
    });

    const frozen = await admin().get(fp(f.order.id)).expect(200);
    await add(f.order.id, kwh.id, '1').expect(409);
    await admin()
      .patch(`${fp(f.order.id)}/activities/${manual.id}`)
      .send({ quantity: '9' })
      .expect(409);
    await admin()
      .delete(`${fp(f.order.id)}/activities/${manual.id}`)
      .expect(409);
    await admin()
      .post(fp(f.order.id) + '/sync')
      .expect(409);
    await admin()
      .post(fp(f.order.id) + '/finalize')
      .send({ boundaryNotes: notes })
      .expect(409);
    await admin().post(fp(f.order.id)).expect(409);
    await admin().patch(`${FACTORS}/${kwh.id}`).send({ kgCo2ePerUnit: '9.00000000' }).expect(200);
    await admin().patch(`${FACTORS}/${f.raw.id}`).send({ kgCo2ePerUnit: '9.00000000' }).expect(200);
    await admin().patch(`${FACTORS}/${f.raw.id}/status`).send({ isActive: false }).expect(200);
    expect((await admin().get(fp(f.order.id)).expect(200)).body).toEqual(frozen.body);
    // Defensa física: la base rechaza mutar actividades y huellas finalizadas.
    await expect(
      kit.prisma.carbonActivity.update({
        where: { id: manual.id },
        data: { description: 'tamper' },
      }),
    ).rejects.toThrow(/immutable/);
    await expect(kit.prisma.carbonActivity.delete({ where: { id: manual.id } })).rejects.toThrow(
      /immutable/,
    );
    await expect(
      kit.prisma.productionFootprint.update({ where: { id: done.id }, data: { totalKgCo2e: '0' } }),
    ).rejects.toThrow(/immutable/);
    await expect(kit.prisma.productionFootprint.delete({ where: { id: done.id } })).rejects.toThrow(
      /cannot be deleted/,
    );
  });
});

describe('C3 concurrency', () => {
  async function ready() {
    const f = await completedOrder(kit, cookies.get('ADMIN')!, actorId, {
      components: [{ unit: 'KILOGRAM', perUnit: '0.05' }],
    });
    await factor({
      category: 'RAW_MATERIAL',
      activityUnit: 'KILOGRAM',
      kgCo2ePerUnit: '2',
      productId: f.components[0].product.id,
    });
    await admin().post(fp(f.order.id)).expect(201);
    return f;
  }

  it('allows exactly one of two concurrent finalizations', async () => {
    const f = await ready();
    const results = await Promise.all([
      admin()
        .post(fp(f.order.id) + '/finalize')
        .send({ boundaryNotes: notes }),
      as('PRODUCCION')
        .post(fp(f.order.id) + '/finalize')
        .send({ boundaryNotes: notes }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const footprint = await kit.prisma.productionFootprint.findUniqueOrThrow({
      where: { productionOrderId: f.order.id },
    });
    expect(
      await kit.prisma.auditLog.count({
        where: { entityId: footprint.id, action: 'FINALIZE_CARBON_FOOTPRINT' },
      }),
    ).toBe(1);
  });

  it('allows exactly one of two concurrent footprint creations', async () => {
    const f = await completedOrder(kit, cookies.get('ADMIN')!, actorId, {
      components: [{ unit: 'KILOGRAM', perUnit: '0.05' }],
    });
    const results = await Promise.all([
      admin().post(fp(f.order.id)),
      as('PRODUCCION').post(fp(f.order.id)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('serializes finalize with a manual edit: never FINALIZED plus a later change', async () => {
    for (let round = 0; round < 3; round += 1) {
      const f = await ready();
      const kwh = await energy('0.5');
      const added = body<Footprint>(await add(f.order.id, kwh.id, '5').expect(201));
      const manual = added.activities.find((a) => a.source === 'MANUAL')!;
      const [finalize, edit] = await Promise.all([
        admin()
          .post(fp(f.order.id) + '/finalize')
          .send({ boundaryNotes: notes }),
        as('PRODUCCION')
          .patch(`${fp(f.order.id)}/activities/${manual.id}`)
          .send({ quantity: '7' }),
      ]);
      expect(finalize.status).toBe(200);
      expect([200, 409]).toContain(edit.status);
      const final = body<Footprint>(await admin().get(fp(f.order.id)).expect(200));
      const activity = final.activities.find((a) => a.id === manual.id)!;
      expect(activity.activityQuantity).toBe(edit.status === 200 ? '7.00000000' : '5.00000000');
      expect(final.totalKgCo2e).toBe(edit.status === 200 ? '23.50000000' : '22.50000000');
      expect(new Date(activity.updatedAt) <= new Date(final.finalizedAt!)).toBe(true);
    }
  });

  function add(orderId: string, emissionFactorId: string, quantity: string) {
    return as('PRODUCCION')
      .post(fp(orderId) + '/activities')
      .send({ emissionFactorId, description: 'Electricidad', quantity });
  }
});

describe('C3 circularity and C2 compatibility', () => {
  it('reports 100000 mL of used oil as 100 L without changing kg CO2e', async () => {
    const f = await completedOrder(kit, cookies.get('ADMIN')!, actorId, {
      components: [
        { unit: 'MILLILITER', perUnit: '500', name: 'Aceite usado TEST' },
        { unit: 'KILOGRAM', perUnit: '0.05' },
      ],
    });
    const [oil, base] = f.components;
    await factor({
      category: 'RAW_MATERIAL',
      activityUnit: 'LITER',
      kgCo2ePerUnit: '0.10000000',
      productId: oil.product.id,
    });
    await factor({
      category: 'RAW_MATERIAL',
      activityUnit: 'KILOGRAM',
      kgCo2ePerUnit: '2',
      productId: base.product.id,
    });
    const before = body<Footprint>(await admin().post(fp(f.order.id)).expect(201));
    expect(before.circularity).toEqual([]);
    expect(before.totalKgCo2ePreview).toBe('30.00000000');
    const metricCode = 'USED_COOKING_OIL_' + tag();
    await as('PRODUCCION')
      .post(CIRCULAR)
      .send({ productId: oil.product.id, metricCode, displayName: 'x', reportingUnit: 'LITER' })
      .expect(403);
    await admin()
      .post(CIRCULAR)
      .send({
        productId: oil.product.id,
        metricCode,
        displayName: 'Aceite',
        reportingUnit: 'KILOGRAM',
      })
      .expect(422);
    const profile = body<{ id: string }>(
      await admin()
        .post(CIRCULAR)
        .send({
          productId: oil.product.id,
          metricCode: metricCode.toLowerCase(),
          displayName: ' Aceite de cocina usado valorizado ',
          reportingUnit: 'LITER',
        })
        .expect(201),
    );
    await admin()
      .post(CIRCULAR)
      .send({
        productId: oil.product.id,
        metricCode: 'OTHER_' + tag(),
        displayName: 'Dup',
        reportingUnit: 'LITER',
      })
      .expect(409);
    const after = body<Footprint>(await admin().get(fp(f.order.id)).expect(200));
    expect(after.circularity).toEqual([
      expect.objectContaining({
        metricCode,
        displayName: 'Aceite de cocina usado valorizado',
        quantity: '100.00000000',
        reportingUnit: 'LITER',
        consumedQuantity: '100000.0000',
        consumedUnit: 'MILLILITER',
      }),
    ]);
    expect(after.totalKgCo2ePreview).toBe(before.totalKgCo2ePreview);
    expect(after.totalsByCategory).toEqual(before.totalsByCategory);
    const finalized = body<Footprint>(
      await admin()
        .post(fp(f.order.id) + '/finalize')
        .send({ boundaryNotes: notes })
        .expect(200),
    );
    expect(finalized.totalKgCo2e).toBe('30.00000000');
    const summary = body<{ circularity: { quantity: string }[] }>(
      await as('VENTAS').get(`/api/sustainability/production-orders/${f.order.id}`).expect(200),
    );
    expect(summary.circularity[0].quantity).toBe('100.00000000');
    await admin()
      .patch(`${CIRCULAR}/${profile.id}`)
      .send({ reportingUnit: 'MILLILITER' })
      .expect(200);
    await admin().patch(`${CIRCULAR}/${profile.id}`).send({ reportingUnit: 'UNIT' }).expect(422);
    await admin()
      .patch(`${CIRCULAR}/${profile.id}`)
      .send({ productId: base.product.id })
      .expect(400);
    await admin().patch(`${CIRCULAR}/${profile.id}/status`).send({ isActive: false }).expect(200);
    expect(body<Footprint>(await admin().get(fp(f.order.id)).expect(200)).totalKgCo2e).toBe(
      '30.00000000',
    );
    const listed = await as('INVENTARIO').get(CIRCULAR).expect(200);
    expect((listed.body as { meta: { total: number } }).meta.total).toBeGreaterThan(0);
    const audit = await kit.prisma.auditLog.findMany({
      where: { entityId: profile.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => a.action)).toEqual(['CREATE', 'UPDATE', 'DISABLE']);
  });

  it('keeps a finalized footprint identical after REJECTED → SCRAP', async () => {
    const f = await completedOrder(kit, cookies.get('ADMIN')!, actorId, {
      components: [{ unit: 'KILOGRAM', perUnit: '0.05' }],
      requiresInspection: true,
    });
    await factor({
      category: 'RAW_MATERIAL',
      activityUnit: 'KILOGRAM',
      kgCo2ePerUnit: '2',
      productId: f.components[0].product.id,
    });
    await admin().post(fp(f.order.id)).expect(201);
    await admin()
      .post(fp(f.order.id) + '/finalize')
      .send({ boundaryNotes: notes })
      .expect(200);
    const before = (await admin().get(fp(f.order.id)).expect(200)).body as {
      data: Footprint & { lot: { status: string } };
    };
    expect(before.data.lot.status).toBe('QUARANTINED');
    const rows = await kit.prisma.carbonActivity.findMany({
      where: { footprint: { productionOrderId: f.order.id } },
      orderBy: { id: 'asc' },
    });
    await admin()
      .post(`/api/production/lots/${f.lotId}/inspection`)
      .send({ result: 'REJECTED', observations: 'Inspección C3', nonConformities: 'Defecto' })
      .expect(201);
    await admin()
      .post(`/api/production/lots/${f.lotId}/disposition`)
      .send({ type: 'SCRAP', reason: 'Descarte C3' })
      .expect(201);
    expect((await kit.prisma.lot.findUniqueOrThrow({ where: { id: f.lotId } })).status).toBe(
      'SCRAPPED',
    );
    const after = (await admin().get(fp(f.order.id)).expect(200)).body as typeof before;
    // Solo cambia el estado vivo del lote; la huella de fabricación permanece idéntica.
    expect(after.data.lot.status).toBe('SCRAPPED');
    expect({ ...after.data, lot: null }).toEqual({ ...before.data, lot: null });
    expect(
      await kit.prisma.carbonActivity.findMany({
        where: { footprint: { productionOrderId: f.order.id } },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(rows);
    expect(await kit.prisma.emissionFactor.count({ where: { kgCo2ePerUnit: { lt: 0 } } })).toBe(0);
  });

  it('lists completed orders with footprint status for every role', async () => {
    const f = await completedOrder(kit, cookies.get('ADMIN')!, actorId, {
      components: [{ unit: 'KILOGRAM', perUnit: '0.05' }],
    });
    const none = await as('COMPRAS')
      .get(`/api/sustainability/production-orders?search=${f.order.number}&footprintStatus=NONE`)
      .expect(200);
    expect((none.body as { data: { id: string; footprint: null }[] }).data).toEqual([
      expect.objectContaining({ id: f.order.id, footprint: null, quantityProduced: '200.0000' }),
    ]);
    await admin().get('/api/sustainability/production-orders?footprintStatus=OTHER').expect(400);
    const draft = await as('VENTAS')
      .get(`/api/sustainability/production-orders?footprintStatus=DRAFT&search=${f.order.number}`)
      .expect(200);
    expect((draft.body as { meta: { total: number } }).meta.total).toBe(0);
    // Completar una OP nunca crea huellas automáticamente.
    expect(
      await kit.prisma.productionFootprint.count({ where: { productionOrderId: f.order.id } }),
    ).toBe(0);
    expect(new Prisma.Decimal('22.5').toFixed(8)).toBe('22.50000000');
  });
});
