import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service.js';
import { InventoryService } from '../src/inventory/movements/inventory.service.js';
import { Prisma, RoleCode, type Product } from '../src/generated/prisma/client.js';
import {
  createTestApp,
  createUser,
  login,
  type TestApp,
  type TestUser,
} from './support/auth-test-kit.js';
import { createInventoryProduct, createInventoryWarehouse } from './support/inventory-fixtures.js';

let kit: TestApp;
let actor: TestUser;
let cookie: string;
let reader: string;
const base = '/api/production/orders';
const data = <T>(response: { body: unknown }) => (response.body as { data: T }).data;
const post = (path: string) => kit.http().post(path).set('Cookie', cookie);
const get = (path: string) => kit.http().get(path).set('Cookie', cookie);
type Order = {
  id: string;
  number: string;
  status: string;
  quantityProduced: string;
  lot: { id: string; code: string; status: string } | null;
};
type Fixture = {
  output: Product;
  component: Product;
  warehouseId: string;
  versionId: string;
  order: Order;
  lotIds: string[];
};

async function fixture(
  options: {
    tracked?: boolean;
    quality?: boolean;
    quantity?: string;
    stock?: string;
    split?: boolean;
    component?: Product;
    warehouseId?: string;
    outputType?: 'INTERMEDIATE' | 'FINISHED_GOOD';
  } = {},
): Promise<Fixture> {
  const raw = await createInventoryProduct(kit.prisma, { isLotTracked: true });
  const output = await kit.prisma.product.update({
    where: { id: raw.id },
    data: {
      type: options.outputType ?? 'FINISHED_GOOD',
      requiresQualityInspection: options.quality ?? false,
    },
  });
  const component =
    options.component ??
    (await createInventoryProduct(kit.prisma, { isLotTracked: options.tracked ?? false }));
  const warehouseId = options.warehouseId ?? (await createInventoryWarehouse(kit.prisma)).id;
  const bom = data<{ id: string }>(
    await post('/api/production/boms')
      .send({ productId: output.id, name: 'C2 ' + randomUUID() })
      .expect(201),
  );
  const version = data<{ id: string }>(
    await post(`/api/production/boms/${bom.id}/versions`)
      .send({ outputQuantity: '1', items: [{ productId: component.id, quantity: '2' }] })
      .expect(201),
  );
  const order = data<Order>(
    await post(base)
      .send({
        productId: output.id,
        bomVersionId: version.id,
        warehouseId,
        quantityPlanned: options.quantity ?? '100',
      })
      .expect(201),
  );
  const lotIds: string[] = [];
  if (options.stock && !options.component) {
    if (component.isLotTracked) {
      const supplier = await kit.prisma.supplier.create({
        data: { code: randomUUID(), name: 'Proveedor C2' },
      });
      const purchase = data<{ id: string; items: Array<{ id: string }> }>(
        await post('/api/purchase-orders')
          .send({
            supplierId: supplier.id,
            items: [{ productId: component.id, quantity: options.stock, unitPrice: '1' }],
          })
          .expect(201),
      );
      await post(`/api/purchase-orders/${purchase.id}/confirm`).send({}).expect(200);
      const quantities = options.split
        ? Array.from({ length: 2 }, () => new Prisma.Decimal(options.stock!).div(2).toFixed(4))
        : [options.stock];
      for (const quantity of quantities)
        await post(`/api/purchase-orders/${purchase.id}/receive`)
          .send({ items: [{ purchaseOrderItemId: purchase.items[0].id, warehouseId, quantity }] })
          .expect(201);
      lotIds.push(
        ...(await kit.prisma.lot.findMany({ where: { productId: component.id } })).map(
          (lot) => lot.id,
        ),
      );
    } else
      await post('/api/inventory/adjustments')
        .send({
          productId: component.id,
          warehouseId,
          type: 'ADJUSTMENT_IN',
          quantity: options.stock,
          reason: 'INITIAL_LOAD',
        })
        .expect(201);
  }
  return { output, component, warehouseId, versionId: version.id, order, lotIds };
}
function complete(f: Fixture, quantityProduced = '95', expiresAt?: string) {
  return post(`${base}/${f.order.id}/complete`).send({
    quantityProduced,
    ...(expiresAt ? { expiresAt } : {}),
    allocations: f.component.isLotTracked
      ? [{ productId: f.component.id, lots: [{ lotId: f.lotIds[0], quantity: '200' }] }]
      : [],
  });
}
async function snapshot(f: Fixture) {
  return {
    order: await kit.prisma.productionOrder.findUnique({ where: { id: f.order.id } }),
    movements: await kit.prisma.inventoryMovement.findMany({
      where: { productionOrderId: f.order.id },
      orderBy: { id: 'asc' },
    }),
    lots: await kit.prisma.lot.findMany({ where: { productionOrderId: f.order.id } }),
    balances: await kit.prisma.stockBalance.findMany({
      where: { productId: { in: [f.output.id, f.component.id] } },
      orderBy: { id: 'asc' },
    }),
    audit: await kit.prisma.auditLog.findMany({
      where: { entityId: f.order.id },
      orderBy: { id: 'asc' },
    }),
    sequence: await kit.prisma.documentSequence.findMany({
      where: { documentType: 'LOT' },
      orderBy: { year: 'asc' },
    }),
  };
}
async function reconcile(f: Fixture) {
  for (const productId of [f.output.id, f.component.id]) {
    const balance = await kit.prisma.stockBalance.findUnique({
      where: { productId_warehouseId: { productId, warehouseId: f.warehouseId } },
    });
    const ledger = await kit.prisma.inventoryMovement.aggregate({
      where: { productId, warehouseId: f.warehouseId },
      _sum: { quantity: true },
    });
    expect(balance?.quantity.toFixed(4) ?? '0.0000').toBe(
      ledger._sum.quantity?.toFixed(4) ?? '0.0000',
    );
  }
}

beforeAll(async () => {
  kit = await createTestApp();
  actor = await createUser(kit, RoleCode.ADMIN);
  cookie = await login(kit, actor);
  reader = await login(kit, await createUser(kit, RoleCode.VENTAS));
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (kit) await kit.close();
});

describe('C-2 production execution', () => {
  it.each(['QUARANTINED', 'REJECTED'] as const)(
    'START excludes %s lot stock without side effects',
    async (status) => {
      const f = await fixture({ tracked: true, stock: '200' });
      await kit.prisma.lot.update({ where: { id: f.lotIds[0] }, data: { status } });
      const before = await snapshot(f);
      await post(`${base}/${f.order.id}/start`).send({}).expect(409);
      expect(await snapshot(f)).toEqual(before);
    },
  );
  it('rejects START without stock and leaves every inventory table unchanged', async () => {
    const f = await fixture();
    const before = await snapshot(f);
    await post(`${base}/${f.order.id}/start`).send({}).expect(409);
    expect(await snapshot(f)).toEqual(before);
  });
  it('START creates no reservation; stock can be spent and COMPLETE revalidates', async () => {
    const f = await fixture({ stock: '200' });
    const before = await snapshot(f);
    await post(`${base}/${f.order.id}/start`).send({}).expect(200);
    const started = await snapshot(f);
    expect(started.balances).toEqual(before.balances);
    expect(started.movements).toEqual([]);
    expect(started.lots).toEqual([]);
    expect(started.sequence).toEqual(before.sequence);
    await post('/api/inventory/adjustments')
      .send({
        productId: f.component.id,
        warehouseId: f.warehouseId,
        type: 'ADJUSTMENT_OUT',
        quantity: '1',
        reason: 'CORRECTION',
      })
      .expect(201);
    const beforeComplete = await snapshot(f);
    await complete(f).expect(409);
    expect(await snapshot(f)).toEqual(beforeComplete);
  });
  it('consumes planned 100, outputs actual 95 in one inventory call and exposes OP in all A-2 queries', async () => {
    const f = await fixture({ tracked: true, stock: '200' });
    const purchaseOrigin = (await get(`/api/inventory/lots/${f.lotIds[0]}`).expect(200)).body as {
      origin: unknown;
    };
    await post(`${base}/${f.order.id}/start`).send({}).expect(200);
    const apply = vi.spyOn(kit.app.get(InventoryService), 'applyMovements');
    const response = await complete(f, '95', '2027-10-13').expect(200);
    const requestId = response.headers['x-request-id'];
    expect(requestId).toBeTruthy();
    const order = data<Order>(response);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(order.status).toBe('COMPLETED');
    expect(order.quantityProduced).toBe('95.0000');
    expect(order.lot?.status).toBe('RELEASED');
    const movements = (await snapshot(f)).movements;
    expect(
      movements.every(
        (movement) =>
          movement.performedByUserId === actor.id &&
          movement.requestId === requestId &&
          movement.reason === null &&
          movement.purchaseReceiptItemId === null,
      ),
    ).toBe(true);
    const lot = await kit.prisma.lot.findUniqueOrThrow({ where: { productionOrderId: order.id } });
    expect(lot.expiresAt?.toISOString().slice(0, 10)).toBe('2027-10-13');
    expect(lot.purchaseReceiptItemId).toBeNull();
    const completed = await kit.prisma.productionOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(lot.originatedAt).toEqual(completed.completedAt);
    expect(movements.map((m) => [m.type, m.quantity.toFixed(4)]).sort()).toEqual([
      ['PRODUCTION_CONSUMPTION', '-200.0000'],
      ['PRODUCTION_OUTPUT', '95.0000'],
    ]);
    const query = (await get(`/api/inventory/movements?productId=${f.output.id}`).expect(200))
      .body as { data: Array<{ productionOrderId: string; businessReference: unknown }> };
    expect(query.data[0]).toMatchObject({
      productionOrderId: order.id,
      businessReference: { type: 'PRODUCTION_ORDER', id: order.id, number: order.number },
    });
    const detail = (await get(`/api/inventory/lots/${order.lot!.id}`).expect(200)).body as {
      origin: unknown;
      movements: Array<{ businessReference: unknown }>;
    };
    expect(detail.origin).toMatchObject({
      type: 'PRODUCTION_ORDER',
      productionOrder: { id: order.id, number: order.number },
    });
    expect(detail.movements[0].businessReference).toMatchObject({
      type: 'PRODUCTION_ORDER',
      number: order.number,
    });
    const listed = (await get(`/api/inventory/lots?productId=${f.output.id}`).expect(200)).body as {
      data: Array<{ origin: unknown }>;
    };
    expect(listed.data[0].origin).toEqual(detail.origin);
    expect(
      ((await get(`/api/inventory/lots/${f.lotIds[0]}`).expect(200)).body as { origin: unknown })
        .origin,
    ).toEqual(purchaseOrigin.origin);
    const trace = data<{ lots: Array<{ origin: { type: string; supplier?: { name: string } } }> }>(
      await get(`/api/production/lots/${order.lot!.id}/traceability`).expect(200),
    );
    expect(trace.lots).toHaveLength(2);
    expect(trace.lots[1].origin.supplier?.name).toBe('Proveedor C2');
    await reconcile(f);
  });
  it.each(['0', '-1', '101', '1.00001'])(
    'rejects invalid produced quantity %s atomically',
    async (quantity) => {
      const f = await fixture({ stock: '200' });
      await post(`${base}/${f.order.id}/start`).send({}).expect(200);
      const before = await snapshot(f);
      const response = await complete(f, quantity);
      expect([400, 422]).toContain(response.status);
      expect(await snapshot(f)).toEqual(before);
    },
  );
  it.each(['199', '201'])('rejects an inexact lot sum %s', async (quantity) => {
    const f = await fixture({ tracked: true, stock: '200' });
    await post(`${base}/${f.order.id}/start`).send({}).expect(200);
    const before = await snapshot(f);
    await post(`${base}/${f.order.id}/complete`)
      .send({
        quantityProduced: '95',
        allocations: [{ productId: f.component.id, lots: [{ lotId: f.lotIds[0], quantity }] }],
      })
      .expect(422);
    expect(await snapshot(f)).toEqual(before);
  });
  it('rejects missing/duplicate lots, unrelated components and nonreleased lots', async () => {
    const f = await fixture({ tracked: true, stock: '200' });
    await post(`${base}/${f.order.id}/start`).send({}).expect(200);
    for (const allocations of [
      [],
      [
        {
          productId: f.component.id,
          lots: [
            { lotId: f.lotIds[0], quantity: '100' },
            { lotId: f.lotIds[0], quantity: '100' },
          ],
        },
      ],
      [{ productId: randomUUID(), lots: [{ lotId: f.lotIds[0], quantity: '200' }] }],
    ])
      await post(`${base}/${f.order.id}/complete`)
        .send({ quantityProduced: '95', allocations })
        .expect(422);
    await kit.prisma.lot.update({ where: { id: f.lotIds[0] }, data: { status: 'QUARANTINED' } });
    const before = await snapshot(f);
    await complete(f).expect(409);
    expect(await snapshot(f)).toEqual(before);
  });
  it('validates per-lot stock, product and warehouse after START', async () => {
    const f = await fixture({ tracked: true, stock: '200', split: true });
    await post(`${base}/${f.order.id}/start`).send({}).expect(200);
    const before = await snapshot(f);
    await complete(f).expect(409);
    expect(await snapshot(f)).toEqual(before);
    const other = await fixture({ tracked: true, stock: '200' });
    await post(`${base}/${f.order.id}/complete`)
      .send({
        quantityProduced: '95',
        allocations: [
          { productId: f.component.id, lots: [{ lotId: other.lotIds[0], quantity: '200' }] },
        ],
      })
      .expect(422);
    const otherWarehouse = (await createInventoryWarehouse(kit.prisma)).id;
    const sameProduct = await fixture({ component: f.component, warehouseId: otherWarehouse });
    await post('/api/inventory/adjustments')
      .send({
        productId: f.component.id,
        warehouseId: otherWarehouse,
        lotId: f.lotIds[0],
        type: 'ADJUSTMENT_IN',
        quantity: '200',
        reason: 'INITIAL_LOAD',
      })
      .expect(201);
    await kit.prisma.productionOrder.update({
      where: { id: sameProduct.order.id },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });
    await post(`${base}/${f.order.id}/complete`)
      .send({
        quantityProduced: '95',
        allocations: [
          { productId: f.component.id, lots: [{ lotId: randomUUID(), quantity: '200' }] },
        ],
      })
      .expect(422);
    // Stock in another warehouse does not enlarge this OP's per-lot availability.
    await complete(f).expect(409);
    await reconcile(f);
  });
  it('two concurrent START requests leave a single transition and audit', async () => {
    const f = await fixture({ stock: '200' });
    const responses = await Promise.all([
      post(`${base}/${f.order.id}/start`).send({}),
      post(`${base}/${f.order.id}/start`).send({}),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(
      await kit.prisma.auditLog.count({ where: { entityId: f.order.id, action: 'START' } }),
    ).toBe(1);
  });
  it('catalog changes after START are revalidated with no partial completion', async () => {
    const f = await fixture({ stock: '200' });
    await post(`${base}/${f.order.id}/start`).send({}).expect(200);
    await kit.prisma.warehouse.update({ where: { id: f.warehouseId }, data: { isActive: false } });
    const before = await snapshot(f);
    await complete(f).expect(422);
    expect(await snapshot(f)).toEqual(before);
  });
  it('serializes concurrent/repeated COMPLETE and preserves one output and one lot', async () => {
    const f = await fixture({ stock: '200' });
    await post(`${base}/${f.order.id}/start`).send({}).expect(200);
    const responses = await Promise.all([complete(f), complete(f)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    await complete(f).expect(409);
    const after = await snapshot(f);
    expect(after.lots).toHaveLength(1);
    expect(after.movements).toHaveLength(2);
    expect(after.audit.filter((a) => a.action === 'COMPLETE')).toHaveLength(1);
    await reconcile(f);
  });
  it('accepts canonical UUIDs submitted with uppercase route and allocation IDs', async () => {
    const f = await fixture({ tracked: true, stock: '200' });
    await post(`${base}/${f.order.id.toUpperCase()}/start`).send({}).expect(200);
    await post(`${base}/${f.order.id.toUpperCase()}/complete`)
      .send({
        quantityProduced: '95',
        allocations: [
          {
            productId: f.component.id.toUpperCase(),
            lots: [{ lotId: f.lotIds[0].toUpperCase(), quantity: '200' }],
          },
        ],
      })
      .expect(200);
    await reconcile(f);
  });
  it('two started orders compete for free stock without overspending', async () => {
    const f = await fixture({ stock: '200' });
    const other = data<Order>(
      await post(base)
        .send({
          productId: f.output.id,
          bomVersionId: f.versionId,
          warehouseId: f.warehouseId,
          quantityPlanned: '100',
        })
        .expect(201),
    );
    await post(`${base}/${f.order.id}/start`).send({}).expect(200);
    await post(`${base}/${other.id}/start`).send({}).expect(200);
    const responses = await Promise.all([complete(f), complete({ ...f, order: other })]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    await reconcile(f);
  });
  it('rolls back output, stock, sequence and state when COMPLETE audit fails', async () => {
    const f = await fixture({ stock: '200' });
    await post(`${base}/${f.order.id}/start`).send({}).expect(200);
    const before = await snapshot(f);
    vi.spyOn(kit.app.get(AuditService), 'record').mockImplementationOnce(async (auditTx) => {
      const tx = auditTx as Prisma.TransactionClient;
      expect(await tx.inventoryMovement.count({ where: { productionOrderId: f.order.id } })).toBe(
        2,
      );
      expect(await tx.lot.count({ where: { productionOrderId: f.order.id } })).toBe(1);
      const output = await tx.stockBalance.findUniqueOrThrow({
        where: { productId_warehouseId: { productId: f.output.id, warehouseId: f.warehouseId } },
      });
      expect(output.quantity.toFixed(4)).toBe('95.0000');
      expect(await tx.documentSequence.findMany({ where: { documentType: 'LOT' } })).not.toEqual(
        before.sequence,
      );
      throw new Error('audit failure after inventory writes');
    });
    await complete(f).expect(500);
    expect(await snapshot(f)).toEqual(before);
  });
  it('rolls back inventory when an intermediate movement write fails', async () => {
    const f = await fixture({ stock: '200' });
    await post(`${base}/${f.order.id}/start`).send({}).expect(200);
    const before = await snapshot(f);
    const inventory = kit.app.get(InventoryService);
    const original = inventory.applyMovements.bind(inventory);
    vi.spyOn(inventory, 'applyMovements').mockImplementationOnce(async (tx, command) => {
      await original(tx, command);
      throw new Error('failure after inventory');
    });
    await complete(f).expect(500);
    expect(await snapshot(f)).toEqual(before);
  });
  it('rejects execution/inspection mutations for read-only roles and cancellation after START', async () => {
    const f = await fixture({ stock: '200' });
    await kit.http().post(`${base}/${f.order.id}/start`).set('Cookie', reader).send({}).expect(403);
    await kit
      .http()
      .post(`${base}/${f.order.id}/complete`)
      .set('Cookie', reader)
      .send({ quantityProduced: '95', allocations: [] })
      .expect(403);
    await post(`${base}/${f.order.id}/start`).send({}).expect(200);
    await post(`${base}/${f.order.id}/cancel`).send({}).expect(409);
  });
});

describe('C-2 quality', () => {
  it('PRODUCCION completes untracked components without inventing physical origins', async () => {
    const f = await fixture({ stock: '200' });
    const producer = await createUser(kit, RoleCode.PRODUCCION);
    const producerCookie = await login(kit, producer);
    await kit
      .http()
      .post(`${base}/${f.order.id}/start`)
      .set('Cookie', producerCookie)
      .send({})
      .expect(200);
    const order = data<Order>(
      await kit
        .http()
        .post(`${base}/${f.order.id}/complete`)
        .set('Cookie', producerCookie)
        .send({ quantityProduced: '95', allocations: [] })
        .expect(200),
    );
    const trace = data<{
      lots: Array<{
        consumptions: Array<{
          lotId: string | null;
          quantity: string;
          warehouse: { id: string };
          productionOrder: { id: string };
          supplier?: unknown;
          origin?: unknown;
        }>;
      }>;
    }>(await get(`/api/production/lots/${order.lot!.id}/traceability`).expect(200));
    expect(trace.lots).toHaveLength(1);
    expect(trace.lots[0].consumptions).toHaveLength(1);
    expect(trace.lots[0].consumptions[0]).toMatchObject({
      lotId: null,
      quantity: '200.0000',
      warehouse: { id: f.warehouseId },
      productionOrder: { id: order.id },
    });
    expect(trace.lots[0].consumptions[0]).not.toHaveProperty('supplier');
    expect(trace.lots[0].consumptions[0]).not.toHaveProperty('origin');
    expect(
      await kit.prisma.inventoryMovement.count({
        where: { productionOrderId: order.id, performedByUserId: producer.id },
      }),
    ).toBe(2);
    await reconcile(f);
  });
  it('serializes concurrent inspections of one lot', async () => {
    const f = await fixture({ quality: true, stock: '200' });
    await post(`${base}/${f.order.id}/start`).send({}).expect(200);
    const order = data<Order>(await complete(f).expect(200));
    const responses = await Promise.all(
      ['APPROVED', 'REJECTED'].map((result) =>
        post(`/api/production/lots/${order.lot!.id}/inspection`).send({
          result,
          observations: 'Concurrencia',
          nonConformities: 'Defecto',
        }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await kit.prisma.qualityInspection.count({ where: { lotId: order.lot!.id } })).toBe(1);
  });
  it('quality vs consumption never consumes a quarantined/rejected lot', async () => {
    const first = await fixture({ quality: true, stock: '200', outputType: 'INTERMEDIATE' });
    await post(`${base}/${first.order.id}/start`).send({}).expect(200);
    const produced = data<Order>(await complete(first).expect(200));
    const next = await fixture({
      component: first.output,
      warehouseId: first.warehouseId,
      quantity: '10',
    });
    // A valid IN_PROGRESS snapshot models an OP whose availability changed since START.
    await kit.prisma.productionOrder.update({
      where: { id: next.order.id },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });
    const [inspection, consumption] = await Promise.all([
      post(`/api/production/lots/${produced.lot!.id}/inspection`).send({
        result: 'REJECTED',
        observations: 'Rechazo',
        nonConformities: 'Defecto',
      }),
      post(`${base}/${next.order.id}/complete`).send({
        quantityProduced: '10',
        allocations: [
          { productId: first.output.id, lots: [{ lotId: produced.lot!.id, quantity: '20' }] },
        ],
      }),
    ]);
    expect(inspection.status).toBe(201);
    expect(consumption.status).toBe(409);
    expect(
      await kit.prisma.inventoryMovement.count({ where: { productionOrderId: next.order.id } }),
    ).toBe(0);
    await reconcile(next);
  });
  it.each(['APPROVED', 'REJECTED'] as const)(
    'inspects %s atomically and forbids reinspections',
    async (result) => {
      const f = await fixture({ quality: true, stock: '200' });
      await post(`${base}/${f.order.id}/start`).send({}).expect(200);
      const order = data<Order>(await complete(f).expect(200));
      const lotId = order.lot!.id;
      expect(order.lot!.status).toBe('QUARANTINED');
      await kit
        .http()
        .post(`/api/production/lots/${lotId}/inspection`)
        .set('Cookie', reader)
        .send({ result, observations: 'Inspección', nonConformities: 'Defecto' })
        .expect(403);
      const payload = {
        result,
        observations: 'Inspección C2',
        ...(result === 'REJECTED' ? { nonConformities: 'Defecto registrado' } : {}),
      };
      await post(`/api/production/lots/${lotId}/inspection`).send(payload).expect(201);
      expect((await kit.prisma.lot.findUniqueOrThrow({ where: { id: lotId } })).status).toBe(
        result === 'APPROVED' ? 'RELEASED' : 'REJECTED',
      );
      await post(`/api/production/lots/${lotId}/inspection`).send(payload).expect(409);
      const inspection = await kit.prisma.qualityInspection.findUniqueOrThrow({ where: { lotId } });
      expect(
        await kit.prisma.auditLog.count({
          where: {
            entityId: inspection.id,
            action: result === 'APPROVED' ? 'QUALITY_APPROVE' : 'QUALITY_REJECT',
          },
        }),
      ).toBe(1);
      await reconcile(f);
    },
  );
  it('quality audit failure leaves the lot quarantined and creates no inspection', async () => {
    const f = await fixture({ quality: true, stock: '200' });
    await post(`${base}/${f.order.id}/start`).send({}).expect(200);
    const order = data<Order>(await complete(f).expect(200));
    vi.spyOn(kit.app.get(AuditService), 'record').mockRejectedValueOnce(
      new Error('quality audit failure'),
    );
    await post(`/api/production/lots/${order.lot!.id}/inspection`)
      .send({ result: 'APPROVED', observations: 'Inspección' })
      .expect(500);
    expect(await kit.prisma.qualityInspection.count({ where: { lotId: order.lot!.id } })).toBe(0);
    expect((await kit.prisma.lot.findUniqueOrThrow({ where: { id: order.lot!.id } })).status).toBe(
      'QUARANTINED',
    );
  });
  it('only produced quarantined lots are inspectable and rejection needs nonconformities', async () => {
    const f = await fixture({ tracked: true, stock: '200' });
    await post(`/api/production/lots/${f.lotIds[0]}/inspection`)
      .send({ result: 'APPROVED', observations: 'Inspección' })
      .expect(422);
    await post(`${base}/${f.order.id}/start`).send({}).expect(200);
    const order = data<Order>(await complete(f).expect(200));
    await post(`/api/production/lots/${order.lot!.id}/inspection`)
      .send({ result: 'APPROVED', observations: 'Inspección' })
      .expect(409);
    await post(`/api/production/lots/${order.lot!.id}/inspection`)
      .send({ result: 'REJECTED', observations: 'Inspección' })
      .expect(422);
  });
  it('an intermediate becomes consumable after approval and traceability reaches its prior OP', async () => {
    const first = await fixture({
      quality: true,
      tracked: true,
      stock: '200',
      outputType: 'INTERMEDIATE',
    });
    await post(`${base}/${first.order.id}/start`).send({}).expect(200);
    const firstOrder = data<Order>(await complete(first).expect(200));
    const second = await fixture({
      component: first.output,
      warehouseId: first.warehouseId,
      quantity: '10',
    });
    second.lotIds = [firstOrder.lot!.id];
    await post(`${base}/${second.order.id}/start`).send({}).expect(409);
    await post(`/api/production/lots/${firstOrder.lot!.id}/inspection`)
      .send({ result: 'APPROVED', observations: 'Liberado' })
      .expect(201);
    await post(`${base}/${second.order.id}/start`).send({}).expect(200);
    const secondOrder = data<Order>(
      await post(`${base}/${second.order.id}/complete`)
        .send({
          quantityProduced: '10',
          allocations: [
            { productId: first.output.id, lots: [{ lotId: firstOrder.lot!.id, quantity: '20' }] },
          ],
        })
        .expect(200),
    );
    const trace = data<{ lots: Array<{ origin: { type: string } }> }>(
      await get(`/api/production/lots/${secondOrder.lot!.id}/traceability`).expect(200),
    );
    expect(trace.lots).toHaveLength(3);
    expect(trace.lots.map((lot) => lot.origin.type)).toEqual([
      'PRODUCTION_ORDER',
      'PRODUCTION_ORDER',
      'PURCHASE_RECEIPT',
    ]);
    await reconcile(second);
  });
});
