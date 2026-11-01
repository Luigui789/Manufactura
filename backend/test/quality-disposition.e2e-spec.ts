import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service.js';
import { RoleCode } from '../src/generated/prisma/client.js';
import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';
import {
  createInventoryLot,
  createInventoryProduct,
  createInventoryWarehouse,
} from './support/inventory-fixtures.js';
let kit: TestApp;
let actorId: string;
const cookies = new Map<RoleCode, string>();
const data = <T>(r: { body: unknown }) => (r.body as { data: T }).data;
type Order = { id: string; lot: { id: string; status: string } };
const post = (url: string) => kit.http().post(url).set('Cookie', cookies.get('ADMIN')!);
const get = (url: string) => kit.http().get(url).set('Cookie', cookies.get('ADMIN')!);
const base = (id: string) => '/api/production/lots/' + id;
async function order(
  componentId: string,
  warehouseId: string,
  type: 'INTERMEDIATE' | 'FINISHED_GOOD' = 'FINISHED_GOOD',
  quantity = '125',
) {
  const output = await kit.prisma.product.create({
    data: {
      code: 'C2-' + randomUUID(),
      name: 'Jabón C2',
      category: 'C2',
      type,
      unit: 'UNIT',
      isLotTracked: true,
      requiresQualityInspection: true,
    },
  });
  const bom = await kit.prisma.billOfMaterial.create({
    data: {
      productId: output.id,
      name: 'C2',
      versions: {
        create: {
          version: 1,
          outputQuantity: '1',
          isActive: true,
          createdByUserId: actorId,
          items: { create: { componentProductId: componentId, quantity: '1' } },
        },
      },
    },
    include: { versions: true },
  });
  const op = data<Order>(
    await post('/api/production/orders')
      .send({
        productId: output.id,
        bomVersionId: bom.versions[0].id,
        warehouseId,
        quantityPlanned: quantity,
      })
      .expect(201),
  );
  return { output, op };
}
async function produced(type: 'INTERMEDIATE' | 'FINISHED_GOOD' = 'FINISHED_GOOD') {
  const raw = await createInventoryProduct(kit.prisma);
  const warehouse = await createInventoryWarehouse(kit.prisma);
  await post('/api/inventory/adjustments')
    .send({
      productId: raw.id,
      warehouseId: warehouse.id,
      type: 'ADJUSTMENT_IN',
      quantity: '125',
      reason: 'INITIAL_LOAD',
    })
    .expect(201);
  const f = await order(raw.id, warehouse.id, type);
  await post('/api/production/orders/' + f.op.id + '/start')
    .send({})
    .expect(200);
  const completed = data<Order>(
    await post('/api/production/orders/' + f.op.id + '/complete')
      .send({ quantityProduced: '125', allocations: [] })
      .expect(200),
  );
  expect(completed.lot.status).toBe('QUARANTINED');
  return { ...f, raw, warehouse, lotId: completed.lot.id };
}
async function reject(f: { lotId: string }) {
  return data<{ id: string }>(
    await post(base(f.lotId) + '/inspection')
      .send({
        result: 'REJECTED',
        observations: 'Inspección humana',
        nonConformities: 'Defecto visible',
      })
      .expect(201),
  );
}
async function snapshot(f: { lotId: string; output: { id: string } }) {
  return {
    lot: await kit.prisma.lot.findUnique({ where: { id: f.lotId } }),
    inspection: await kit.prisma.qualityInspection.findUnique({ where: { lotId: f.lotId } }),
    disposition: await kit.prisma.qualityDisposition.findUnique({ where: { lotId: f.lotId } }),
    movements: await kit.prisma.inventoryMovement.findMany({
      where: { lotId: f.lotId },
      orderBy: { id: 'asc' },
    }),
    balances: await kit.prisma.stockBalance.findMany({
      where: { productId: f.output.id },
      orderBy: { id: 'asc' },
    }),
  };
}
const dispose = (lotId: string, type: string) =>
  post(base(lotId) + '/disposition').send({ type, reason: '  Decisión explícita  ' });
beforeAll(async () => {
  kit = await createTestApp();
  for (const role of Object.values(RoleCode)) {
    const user = await createUser(kit, role);
    if (role === 'ADMIN') actorId = user.id;
    cookies.set(role, await login(kit, user));
  }
}, 30000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (kit) await kit.close();
});
describe('C2 quality disposition PostgreSQL', () => {
  it.each(['RELEASE', 'REWORK', 'SCRAP'] as const)(
    'records %s while preserving inspection, IIoT and historic ledger',
    async (type) => {
      const f = await produced();
      const inspection = await reject(f);
      const device = await kit.prisma.iiotDevice.create({
        data: { code: 'C2-' + randomUUID(), name: 'C2 evidence' },
      });
      await kit.prisma.iiotReading.create({
        data: {
          productionOrderId: f.op.id,
          deviceId: device.id,
          metric: 'TEMPERATURE',
          value: '50',
          unit: '°C',
          recordedAt: new Date(),
        },
      });
      await kit.prisma.iiotAlert.create({
        data: {
          productionOrderId: f.op.id,
          type: 'C2 evidence',
          severity: 'CRITICAL',
          message: 'Context only',
        },
      });
      const readings = await kit.prisma.iiotReading.findMany({
        where: { productionOrderId: f.op.id },
      });
      const alerts = await kit.prisma.iiotAlert.findMany({ where: { productionOrderId: f.op.id } });
      expect(data(await get(base(f.lotId) + '/disposition').expect(200))).toBeNull();
      const before = await snapshot(f);
      const response = await dispose(f.lotId, type).expect(201);
      const disposition = data<{
        id: string;
        reason: string;
        decidedBy: { id: string };
        decidedAt: string;
      }>(response);
      expect(disposition.reason).toBe('Decisión explícita');
      expect(disposition.decidedBy.id).toBe(actorId);
      expect(typeof disposition.decidedAt).toBe('string');
      const after = await snapshot(f);
      expect(after.inspection).toEqual(before.inspection);
      expect(after.lot?.status).toBe(
        { RELEASE: 'RELEASED', REWORK: 'REWORK', SCRAP: 'SCRAPPED' }[type],
      );
      expect(after.disposition?.inspectionId).toBe(inspection.id);
      expect(after.movements.filter((m) => m.type !== 'QUALITY_SCRAP')).toEqual(before.movements);
      expect(
        await kit.prisma.iiotReading.findMany({ where: { productionOrderId: f.op.id } }),
      ).toEqual(readings);
      expect(
        await kit.prisma.iiotAlert.findMany({ where: { productionOrderId: f.op.id } }),
      ).toEqual(alerts);
      expect(
        after.movements.filter((m) => m.type === 'QUALITY_SCRAP').map((m) => m.quantity.toFixed(4)),
      ).toEqual(type === 'SCRAP' ? ['-125.0000'] : []);
      expect(after.balances[0].quantity.toFixed(4)).toBe(type === 'SCRAP' ? '0.0000' : '125.0000');
      const audit = await kit.prisma.auditLog.findMany({ where: { entityId: disposition.id } });
      expect(audit).toHaveLength(1);
      expect(audit[0].action).toBe('QUALITY_DISPOSITION_' + type);
      expect(audit[0].newValues).toMatchObject({
        inspectionResult: 'REJECTED',
        previousLotStatus: 'REJECTED',
        newLotStatus: after.lot?.status,
        reason: 'Decisión explícita',
      });
      if (type === 'SCRAP') {
        expect(audit[0].newValues).toMatchObject({
          scrappedInventory: [{ warehouseId: f.warehouse.id, quantity: '125.0000' }],
        });
        expect(after.movements.at(-1)?.requestId).toBe(response.headers['x-request-id']);
      }
      const trace = data<{
        lots: { quality: { inspection: { result: string }; disposition: { type: string } } }[];
      }>(await get(base(f.lotId) + '/traceability').expect(200));
      expect(trace.lots[0].quality).toMatchObject({
        inspection: { result: 'REJECTED' },
        disposition: { type },
      });
      await dispose(f.lotId, 'RELEASE').expect(409);
      await post(base(f.lotId) + '/inspection')
        .send({ result: 'APPROVED', observations: 'No reinspección' })
        .expect(409);
    },
  );
  it('scraps exact positive balances across warehouses including inactive catalog', async () => {
    const f = await produced();
    await reject(f);
    const second = await createInventoryWarehouse(kit.prisma);
    await post('/api/inventory/adjustments')
      .send({
        productId: f.output.id,
        warehouseId: second.id,
        lotId: f.lotId,
        type: 'ADJUSTMENT_IN',
        quantity: '0.1250',
        reason: 'PHYSICAL_COUNT',
      })
      .expect(201);
    await kit.prisma.product.update({ where: { id: f.output.id }, data: { isActive: false } });
    await kit.prisma.warehouse.update({ where: { id: second.id }, data: { isActive: false } });
    await dispose(f.lotId, 'SCRAP').expect(201);
    const rows = await kit.prisma.inventoryMovement.findMany({
      where: { lotId: f.lotId, type: 'QUALITY_SCRAP' },
      orderBy: { warehouseId: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((m) => m.quantity.toFixed(4)).sort()).toEqual(['-0.1250', '-125.0000']);
    expect(
      (
        await kit.prisma.inventoryMovement.aggregate({
          where: { lotId: f.lotId },
          _sum: { quantity: true },
        })
      )._sum.quantity?.toFixed(4),
    ).toBe('0.0000');
    for (const row of rows)
      expect(
        (
          await kit.prisma.stockBalance.findUniqueOrThrow({
            where: {
              productId_warehouseId: { productId: f.output.id, warehouseId: row.warehouseId },
            },
          })
        ).quantity.toFixed(4),
      ).toBe('0.0000');
  });
  it('C7 scraps the remaining 6, not the original 125, after a partial adjustment', async () => {
    const f = await produced();
    await reject(f);
    await post('/api/inventory/adjustments')
      .send({
        productId: f.output.id,
        warehouseId: f.warehouse.id,
        lotId: f.lotId,
        type: 'ADJUSTMENT_OUT',
        quantity: '119',
        reason: 'CORRECTION',
      })
      .expect(201);
    await dispose(f.lotId, 'SCRAP').expect(201);
    const after = await snapshot(f);
    expect(
      after.movements
        .filter((movement) => movement.type === 'QUALITY_SCRAP')
        .map((movement) => movement.quantity.toFixed(4)),
    ).toEqual(['-6.0000']);
    expect(after.balances[0].quantity.toFixed(4)).toBe('0.0000');
    expect(after.lot?.status).toBe('SCRAPPED');
  });
  it('rolls back disposition, lot, movements and balances if audit fails', async () => {
    const f = await produced();
    await reject(f);
    const before = await snapshot(f);
    vi.spyOn(kit.app.get(AuditService), 'record').mockRejectedValue(new Error('Audit failure'));
    await dispose(f.lotId, 'SCRAP').expect(500);
    expect(await snapshot(f)).toEqual(before);
  });
  it('serializes concurrent REWORK/SCRAP: one success, one conflict, one decision/audit', async () => {
    const f = await produced();
    await reject(f);
    const results = await Promise.all([dispose(f.lotId, 'REWORK'), dispose(f.lotId, 'SCRAP')]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const after = await snapshot(f);
    expect(await kit.prisma.qualityDisposition.count({ where: { lotId: f.lotId } })).toBe(1);
    expect(await kit.prisma.auditLog.count({ where: { entityId: after.disposition!.id } })).toBe(1);
    const scrap = after.disposition!.type === 'SCRAP';
    expect(after.lot?.status).toBe(scrap ? 'SCRAPPED' : 'REWORK');
    expect(after.balances[0].quantity.toFixed(4)).toBe(scrap ? '0.0000' : '125.0000');
    expect(after.movements.filter((m) => m.type === 'QUALITY_SCRAP')).toHaveLength(scrap ? 1 : 0);
  });
  it('allows PRODUCCION to decide and records that actor', async () => {
    const f = await produced();
    await reject(f);
    const response = await kit
      .http()
      .post(base(f.lotId) + '/disposition')
      .set('Cookie', cookies.get('PRODUCCION')!)
      .send({ type: 'REWORK', reason: 'Decisión de producción' })
      .expect(201);
    expect(data<{ decidedByUserId: string }>(response).decidedByUserId).not.toBe(actorId);
  });
  it('scraps a zero-balance lot without inventing a movement', async () => {
    const f = await produced();
    await reject(f);
    await post('/api/inventory/adjustments')
      .send({
        productId: f.output.id,
        warehouseId: f.warehouse.id,
        lotId: f.lotId,
        type: 'ADJUSTMENT_OUT',
        quantity: '125',
        reason: 'PHYSICAL_COUNT',
      })
      .expect(201);
    await dispose(f.lotId, 'SCRAP').expect(201);
    expect(
      await kit.prisma.inventoryMovement.count({
        where: { lotId: f.lotId, type: 'QUALITY_SCRAP' },
      }),
    ).toBe(0);
    expect((await snapshot(f)).lot?.status).toBe('SCRAPPED');
  });
  it('serializes scrap with an adjustment into a previously unused warehouse', async () => {
    const f = await produced();
    await reject(f);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const [scrap, adjustment] = await Promise.all([
      dispose(f.lotId, 'SCRAP'),
      post('/api/inventory/adjustments').send({
        productId: f.output.id,
        warehouseId: warehouse.id,
        lotId: f.lotId,
        type: 'ADJUSTMENT_IN',
        quantity: '1',
        reason: 'PHYSICAL_COUNT',
      }),
    ]);
    expect(scrap.status).toBe(201);
    expect([201, 409]).toContain(adjustment.status);
    const quantity = await kit.prisma.inventoryMovement.aggregate({
      where: { lotId: f.lotId },
      _sum: { quantity: true },
    });
    expect(quantity._sum.quantity?.toFixed(4)).toBe('0.0000');
    expect((await snapshot(f)).lot?.status).toBe('SCRAPPED');
  });
  it('validates origin, inspection, status, authentication and DTO', async () => {
    const f = await produced();
    await get(base(randomUUID()) + '/disposition').expect(404);
    await dispose(randomUUID(), 'SCRAP').expect(404);
    await dispose(f.lotId, 'SCRAP').expect(422);
    await post(base(f.lotId) + '/inspection')
      .send({ result: 'APPROVED', observations: 'Conforme' })
      .expect(201);
    await dispose(f.lotId, 'REWORK').expect(422);
    const raw = await createInventoryProduct(kit.prisma, { isLotTracked: true });
    const purchaseLot = await createInventoryLot(kit.prisma, raw.id, 'REJECTED');
    await dispose(purchaseLot.id, 'SCRAP').expect(422);
    const rejected = await produced();
    await reject(rejected);
    await kit.prisma.lot.update({ where: { id: rejected.lotId }, data: { status: 'RELEASED' } });
    await dispose(rejected.lotId, 'SCRAP').expect(409);
    await kit
      .http()
      .get(base(f.lotId) + '/disposition')
      .expect(401);
    await kit
      .http()
      .post(base(f.lotId) + '/disposition')
      .send({ type: 'SCRAP', reason: 'x' })
      .expect(401);
    for (const role of ['COMPRAS', 'INVENTARIO', 'VENTAS'] as const) {
      await kit
        .http()
        .post(base(f.lotId) + '/disposition')
        .set('Cookie', cookies.get(role)!)
        .send({ type: 'SCRAP', reason: 'x' })
        .expect(403);
      await kit
        .http()
        .get(base(f.lotId) + '/disposition')
        .set('Cookie', cookies.get(role)!)
        .expect(200);
    }
    for (const body of [
      { type: 'BAD', reason: 'x' },
      { type: 'RELEASE', reason: ' ' },
      { type: 'REWORK', reason: 'x'.repeat(1001) },
      { type: 'SCRAP' },
      { type: 'SCRAP', reason: 'x', unknown: true },
    ])
      await post(base(f.lotId) + '/disposition')
        .send(body)
        .expect(400);
  });
  it.each(['RELEASE', 'REWORK', 'SCRAP'] as const)(
    '%s controls dispatch and cannot revive scrap with adjustments',
    async (type) => {
      const f = await produced();
      await reject(f);
      const customer = await kit.prisma.customer.create({
        data: { code: randomUUID(), name: 'C2' },
      });
      const sale = data<{ id: string; items: { id: string }[] }>(
        await post('/api/sales/orders')
          .send({
            customerId: customer.id,
            items: [{ productId: f.output.id, quantity: '1', unitPrice: '1' }],
          })
          .expect(201),
      );
      await kit.prisma.saleOrder.update({ where: { id: sale.id }, data: { status: 'CONFIRMED' } });
      const dispatch = () =>
        post('/api/sales/orders/' + sale.id + '/dispatch').send({
          items: [
            {
              saleOrderItemId: sale.items[0].id,
              warehouseId: f.warehouse.id,
              lotId: f.lotId,
              quantity: '1',
            },
          ],
        });
      await dispatch().expect(409);
      await dispose(f.lotId, type).expect(201);
      await dispatch().expect(type === 'RELEASE' ? 200 : 409);
      if (type === 'SCRAP')
        await post('/api/inventory/adjustments')
          .send({
            productId: f.output.id,
            warehouseId: f.warehouse.id,
            lotId: f.lotId,
            type: 'ADJUSTMENT_IN',
            quantity: '1',
            reason: 'CORRECTION',
          })
          .expect(409);
    },
  );
  it.each(['RELEASE', 'REWORK', 'SCRAP'] as const)(
    '%s controls consumption of produced intermediate lots',
    async (type) => {
      const f = await produced('INTERMEDIATE');
      const consumer = await order(f.output.id, f.warehouse.id, 'FINISHED_GOOD', '1');
      await post('/api/production/orders/' + consumer.op.id + '/start')
        .send({})
        .expect(409);
      await reject(f);
      const source = await kit.prisma.productionOrder.findUniqueOrThrow({ where: { id: f.op.id } });
      await post('/api/inventory/adjustments')
        .send({
          productId: f.raw.id,
          warehouseId: f.warehouse.id,
          type: 'ADJUSTMENT_IN',
          quantity: '1',
          reason: 'INITIAL_LOAD',
        })
        .expect(201);
      const alternate = data<Order>(
        await post('/api/production/orders')
          .send({
            productId: f.output.id,
            bomVersionId: source.bomVersionId,
            warehouseId: f.warehouse.id,
            quantityPlanned: '1',
          })
          .expect(201),
      );
      await post('/api/production/orders/' + alternate.id + '/start')
        .send({})
        .expect(200);
      const completed = data<Order>(
        await post('/api/production/orders/' + alternate.id + '/complete')
          .send({ quantityProduced: '1', allocations: [] })
          .expect(200),
      );
      await post(base(completed.lot.id) + '/inspection')
        .send({ result: 'APPROVED', observations: 'Lote alternativo conforme' })
        .expect(201);
      await post('/api/production/orders/' + consumer.op.id + '/start')
        .send({})
        .expect(200);
      await dispose(f.lotId, type).expect(201);
      await post('/api/production/orders/' + consumer.op.id + '/complete')
        .send({
          quantityProduced: '1',
          allocations: [{ productId: f.output.id, lots: [{ lotId: f.lotId, quantity: '1' }] }],
        })
        .expect(type === 'RELEASE' ? 200 : 409);
    },
  );
  it('enforces reason, inspection/lot consistency, uniqueness and immutability in SQL', async () => {
    const f = await produced();
    const inspection = await reject(f);
    const g = await produced();
    const other = await reject(g);
    const input = {
      lotId: f.lotId,
      inspectionId: inspection.id,
      type: 'REWORK' as const,
      reason: ' ',
      decidedByUserId: actorId,
    };
    await expect(kit.prisma.qualityDisposition.create({ data: input })).rejects.toThrow();
    await expect(
      kit.prisma.qualityDisposition.create({
        data: { ...input, reason: 'x', inspectionId: other.id },
      }),
    ).rejects.toThrow();
    const decision = await kit.prisma.qualityDisposition.create({
      data: { ...input, reason: 'x' },
    });
    await expect(
      kit.prisma.qualityDisposition.create({ data: { ...input, reason: 'x' } }),
    ).rejects.toThrow();
    await expect(
      kit.prisma.qualityDisposition.update({
        where: { id: decision.id },
        data: { reason: 'edited' },
      }),
    ).rejects.toThrow();
    await expect(
      kit.prisma.qualityDisposition.delete({ where: { id: decision.id } }),
    ).rejects.toThrow();
  });
});
