import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service.js';
import { InventoryService } from '../src/inventory/movements/inventory.service.js';
import { RoleCode, type Product, type Warehouse } from '../src/generated/prisma/client.js';
import {
  createTestApp,
  createUser,
  login,
  type TestApp,
  type TestUser,
} from './support/auth-test-kit.js';
import { createInventoryProduct, createInventoryWarehouse } from './support/inventory-fixtures.js';
import { serializeOrder } from '../src/purchases/purchase-orders/purchase-order-mapping.js';
type Order = ReturnType<typeof serializeOrder>;
let kit: TestApp;
let actor: TestUser;
const cookies = new Map<RoleCode, string>();
const base = '/api/purchase-orders';
const data = (r: { body: unknown }) => (r.body as { data: Order }).data;
const post = (path = base, role: RoleCode = 'COMPRAS') =>
  kit.http().post(path).set('Cookie', cookies.get(role)!);
const get = (path: string, role: RoleCode = 'COMPRAS') =>
  kit.http().get(path).set('Cookie', cookies.get(role)!);
const patch = (id: string) =>
  kit
    .http()
    .patch(base + '/' + id)
    .set('Cookie', cookies.get('COMPRAS')!);
async function fixture(tracked = false, quality = false, count = 1) {
  const products: Product[] = [];
  for (let i = 0; i < count; i++) {
    const product = await createInventoryProduct(kit.prisma, { isLotTracked: tracked });
    products.push(
      await kit.prisma.product.update({
        where: { id: product.id },
        data: { requiresQualityInspection: quality },
      }),
    );
  }
  const warehouse = await createInventoryWarehouse(kit.prisma);
  const supplier = await kit.prisma.supplier.create({
    data: { code: 'COM-' + randomUUID(), name: 'Proveedor compras' },
  });
  const payload = {
    supplierId: supplier.id,
    expectedDate: '2026-12-01',
    items: products.map((product) => ({
      productId: product.id,
      quantity: '100',
      unitPrice: '1.005',
    })),
  };
  return { products, warehouse, supplier, payload };
}
async function confirmed(f: Awaited<ReturnType<typeof fixture>>) {
  const draft = data(await post().send(f.payload).expect(201));
  return data(
    await post(base + '/' + draft.id + '/confirm')
      .send({})
      .expect(200),
  );
}
function row(order: Order, warehouse: Warehouse, quantity = '30', index = 0) {
  return { purchaseOrderItemId: order.items[index].id, warehouseId: warehouse.id, quantity };
}
async function snapshot(order: Order, products: Product[]) {
  const ids = products.map((p) => p.id);
  return {
    order: await kit.prisma.purchaseOrder.findUnique({ where: { id: order.id } }),
    receipts: await kit.prisma.purchaseReceipt.findMany({
      where: { purchaseOrderId: order.id },
      include: { items: true },
    }),
    lots: await kit.prisma.lot.findMany({ where: { productId: { in: ids } } }),
    movements: await kit.prisma.inventoryMovement.findMany({ where: { productId: { in: ids } } }),
    balances: await kit.prisma.stockBalance.findMany({ where: { productId: { in: ids } } }),
    audits: await kit.prisma.auditLog.findMany({ where: { entityId: order.id } }),
    sequences: await kit.prisma.documentSequence.findMany({ orderBy: { id: 'asc' } }),
  };
}
async function reconcile(products: Product[]) {
  for (const product of products) {
    const balances = await kit.prisma.stockBalance.findMany({ where: { productId: product.id } });
    for (const balance of balances) {
      const ledger = await kit.prisma.inventoryMovement.aggregate({
        where: { productId: product.id, warehouseId: balance.warehouseId },
        _sum: { quantity: true },
      });
      expect(ledger._sum.quantity?.equals(balance.quantity)).toBe(true);
    }
  }
}
beforeAll(async () => {
  kit = await createTestApp();
  for (const role of Object.values(RoleCode)) {
    const user = await createUser(kit, role);
    if (role === 'COMPRAS') actor = user;
    cookies.set(role, await login(kit, user));
  }
}, 30000);
afterAll(async () => {
  await kit?.close();
});
afterEach(() => vi.restoreAllMocks());
describe('Compras transaccionales', () => {
  it('creates, lists, filters, edits and confirms without inventory writes; audits each action', async () => {
    const f = await fixture();
    const order = data(await post().send(f.payload).expect(201));
    expect(order.status).toBe('DRAFT');
    expect(order.total).toBe('100.50');
    expect(order.number).toMatch(/^OC-\d{4}-\d{6,}$/);
    expect(order.expectedDate).toBe('2026-12-01');
    const before = await snapshot(order, f.products);
    const changed = data(
      await patch(order.id)
        .send({
          expectedDate: null,
          items: [{ productId: f.products[0].id, quantity: '10', unitPrice: '0.1005' }],
        })
        .expect(200),
    );
    expect(changed.total).toBe('1.01');
    expect(changed.expectedDate).toBeNull();
    expect(
      data(
        await post(base + '/' + order.id + '/confirm')
          .send({})
          .expect(200),
      ).status,
    ).toBe('CONFIRMED');
    await patch(order.id).send({ expectedDate: '2026-12-02' }).expect(409);
    await post(base + '/' + order.id + '/confirm')
      .send({})
      .expect(409);
    const after = await snapshot(order, f.products);
    expect(after.movements).toEqual(before.movements);
    expect(after.balances).toEqual(before.balances);
    expect(after.lots).toEqual(before.lots);
    expect(after.audits.map((a) => a.action)).toEqual(
      expect.arrayContaining(['CREATE', 'UPDATE', 'CONFIRM']),
    );
    const list = await get(
      base +
        '?page=1&limit=1&status=CONFIRMED&supplierId=' +
        f.supplier.id +
        '&search=' +
        order.number,
    ).expect(200);
    expect((list.body as { data: Order[]; meta: { total: number } }).data[0].id).toBe(order.id);
    expect((list.body as { meta: { total: number } }).meta.total).toBe(1);
  });
  it.each([false, true])(
    'cancels an unreceived order (confirmed=%s), without stock',
    async (isConfirmed) => {
      const f = await fixture();
      const order = isConfirmed
        ? await confirmed(f)
        : data(await post().send(f.payload).expect(201));
      const before = await snapshot(order, f.products);
      const result = data(
        await post(base + '/' + order.id + '/cancel')
          .send({})
          .expect(200),
      );
      expect(result.status).toBe('CANCELLED');
      await post(base + '/' + order.id + '/receive')
        .send({ items: [row(order, f.warehouse)] })
        .expect(409);
      const after = await snapshot(order, f.products);
      expect(after.movements).toEqual(before.movements);
      expect(after.balances).toEqual(before.balances);
      expect(after.lots).toEqual(before.lots);
      expect(after.audits.some((a) => a.action === 'CANCEL')).toBe(true);
    },
  );
  it.each([false, true])(
    'partially and completely receives split rows across warehouses (tracked=%s)',
    async (tracked) => {
      const f = await fixture(tracked);
      const order = await confirmed(f);
      const other = await createInventoryWarehouse(kit.prisma);
      const first = data(
        await post(base + '/' + order.id + '/receive')
          .send({
            receivedAt: '2026-10-13T14:00:00-06:00',
            notes: 'Repartida',
            items: [
              { ...row(order, f.warehouse, '30'), ...(tracked ? { expiresAt: '2027-12-31' } : {}) },
              row(order, other, '20'),
            ],
          })
          .expect(201),
      );
      expect(first.status).toBe('PARTIALLY_RECEIVED');
      expect(first.items[0].quantityReceived).toBe('50.0000');
      expect(first.items[0].quantityPending).toBe('50.0000');
      await post(base + '/' + order.id + '/cancel')
        .send({})
        .expect(409);
      const movements = await kit.prisma.inventoryMovement.findMany({
        where: { productId: f.products[0].id },
        include: { lot: true, purchaseReceiptItem: true },
      });
      expect(movements).toHaveLength(2);
      for (const m of movements) {
        expect(m.type).toBe('PURCHASE_RECEIPT');
        expect(m.reason).toBeNull();
        expect(m.quantity.isPositive()).toBe(true);
        expect(m.purchaseReceiptItemId).toBe(m.purchaseReceiptItem?.id);
        if (tracked) {
          expect(m.lot?.purchaseReceiptItemId).toBe(m.purchaseReceiptItemId);
          expect(m.lot?.status).toBe('RELEASED');
          expect(m.lot?.originatedAt.toISOString()).toBe('2026-10-13T20:00:00.000Z');
        } else expect(m.lotId).toBeNull();
      }
      expect(first.receipts[0].items.filter((i) => i.lot)).toHaveLength(tracked ? 2 : 0);
      if (tracked)
        expect(first.receipts[0].items.some((i) => i.lot?.expiresAt === '2027-12-31')).toBe(true);
      const complete = data(
        await post(base + '/' + order.id + '/receive')
          .send({ items: [row(order, f.warehouse, '50')] })
          .expect(201),
      );
      expect(complete.status).toBe('RECEIVED');
      expect(complete.items[0].quantityPending).toBe('0.0000');
      await post(base + '/' + order.id + '/cancel')
        .send({})
        .expect(409);
      await post(base + '/' + order.id + '/receive')
        .send({ items: [row(order, f.warehouse, '1')] })
        .expect(409);
      const history = await get(base + '/' + order.id + '/receipts').expect(200);
      expect((history.body as { data: unknown[] }).data).toHaveLength(2);
      await reconcile(f.products);
    },
  );
  it('creates quarantined lots for products requiring inspection', async () => {
    const f = await fixture(true, true);
    const order = await confirmed(f);
    const result = data(
      await post(base + '/' + order.id + '/receive')
        .send({ items: [row(order, f.warehouse)] })
        .expect(201),
    );
    expect(result.receipts[0].items[0].lot?.status).toBe('QUARANTINED');
    await reconcile(f.products);
  });
  it('rejects aggregated overreceipt, including previously received quantities', async () => {
    const f = await fixture();
    const order = await confirmed(f);
    await post(base + '/' + order.id + '/receive')
      .send({ items: [row(order, f.warehouse, '40')] })
      .expect(201);
    const before = await snapshot(order, f.products);
    await post(base + '/' + order.id + '/receive')
      .send({ items: [row(order, f.warehouse, '35'), row(order, f.warehouse, '30')] })
      .expect(409);
    expect(await snapshot(order, f.products)).toEqual(before);
  });
  it('serializes concurrent receipts on the order and prevents overreceipt', async () => {
    const f = await fixture(true);
    const order = await confirmed(f);
    const results = await Promise.all(
      [1, 2].map(() =>
        post(base + '/' + order.id + '/receive').send({ items: [row(order, f.warehouse, '70')] }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(data(await get(base + '/' + order.id)).items[0].quantityReceived).toBe('70.0000');
    expect(
      await kit.prisma.inventoryMovement.count({ where: { productId: f.products[0].id } }),
    ).toBe(1);
    await reconcile(f.products);
  });
  it('derives completion per line, not from totals across lines', async () => {
    const f = await fixture(false, false, 2);
    const order = await confirmed(f);
    expect(
      data(
        await post(base + '/' + order.id + '/receive')
          .send({ items: [row(order, f.warehouse, '100', 0)] })
          .expect(201),
      ).status,
    ).toBe('PARTIALLY_RECEIVED');
    expect(
      data(
        await post(base + '/' + order.id + '/receive')
          .send({ items: [row(order, f.warehouse, '100', 1)] })
          .expect(201),
      ).status,
    ).toBe('RECEIVED');
  });
  it('rolls back documents, items, lots, movements, balances, state, sequences and partial audit on audit failure', async () => {
    const f = await fixture(true);
    const order = await confirmed(f);
    const before = await snapshot(order, f.products);
    const audit = kit.app.get(AuditService);
    const original = audit.record.bind(audit);
    let calls = 0;
    vi.spyOn(audit, 'record').mockImplementation(async (tx, event) => {
      if (event.action === 'RECEIVE' && ++calls === 2) throw new Error('forced audit failure');
      return original(tx, event);
    });
    await post(base + '/' + order.id + '/receive')
      .send({ items: [row(order, f.warehouse)] })
      .expect(500);
    expect(calls).toBe(2);
    expect(await snapshot(order, f.products)).toEqual(before);
    const logs = await kit.prisma.auditLog.findMany({
      where: { action: 'RECEIVE', newValues: { path: ['purchaseOrderId'], equals: order.id } },
    });
    expect(logs).toHaveLength(0);
  });
  it('rolls back after an inventory line fails following lots and the first movement', async () => {
    const f = await fixture(true);
    const order = await confirmed(f);
    const before = await snapshot(order, f.products);
    const inventory = kit.app.get(InventoryService);
    const original = inventory.applyMovements.bind(inventory);
    let count = 0;
    vi.spyOn(inventory, 'applyMovements').mockImplementation(async (tx, command) => {
      const failingTx = new Proxy(tx, {
        get(target, property) {
          if (property !== 'inventoryMovement') return Reflect.get(target, property) as unknown;
          return new Proxy(target.inventoryMovement, {
            get(delegate, method) {
              if (method !== 'create') return Reflect.get(delegate, method) as unknown;
              return async (...args: Parameters<typeof tx.inventoryMovement.create>) => {
                if (++count === 2) throw new Error('forced second movement failure');
                return target.inventoryMovement.create(...args);
              };
            },
          });
        },
      });
      return original(failingTx, command);
    });
    await post(base + '/' + order.id + '/receive')
      .send({ items: [row(order, f.warehouse, '20'), row(order, f.warehouse, '20')] })
      .expect(500);
    expect(count).toBe(2);
    expect(await snapshot(order, f.products)).toEqual(before);
  });
  it('rejects wrong order item, inactive warehouse, nonexistent IDs and expiration on untracked products', async () => {
    const f = await fixture();
    const order = await confirmed(f);
    const another = await confirmed(await fixture());
    await post(base + '/' + order.id + '/receive')
      .send({ items: [row(another, f.warehouse)] })
      .expect(404);
    await post(base + '/' + order.id + '/receive')
      .send({ items: [{ ...row(order, f.warehouse), warehouseId: randomUUID() }] })
      .expect(422);
    await post(base + '/' + order.id + '/receive')
      .send({ items: [{ ...row(order, f.warehouse), expiresAt: '2027-01-01' }] })
      .expect(422);
    await kit.prisma.warehouse.update({ where: { id: f.warehouse.id }, data: { isActive: false } });
    await post(base + '/' + order.id + '/receive')
      .send({ items: [row(order, f.warehouse)] })
      .expect(409);
  });
  it('validates supplier and product activation/type when creating and confirming', async () => {
    const f = await fixture();
    await post()
      .send({ ...f.payload, supplierId: randomUUID() })
      .expect(404);
    await kit.prisma.supplier.update({ where: { id: f.supplier.id }, data: { isActive: false } });
    await post().send(f.payload).expect(409);
    await kit.prisma.supplier.update({ where: { id: f.supplier.id }, data: { isActive: true } });
    const order = data(await post().send(f.payload).expect(201));
    await kit.prisma.product.update({ where: { id: f.products[0].id }, data: { isActive: false } });
    await post(base + '/' + order.id + '/confirm')
      .send({})
      .expect(409);
    await post().send(f.payload).expect(409);
    await kit.prisma.product.update({
      where: { id: f.products[0].id },
      data: { isActive: true, type: 'FINISHED_GOOD' },
    });
    await post().send(f.payload).expect(422);
  });
  it('requires string decimal DTOs and valid dates, arrays, IDs, bounded pagination', async () => {
    const f = await fixture();
    for (const payload of [
      { ...f.payload, items: [] },
      { ...f.payload, expectedDate: '2026-02-30' },
      { ...f.payload, items: [{ ...f.payload.items[0], quantity: 1 }] },
      { ...f.payload, items: [{ ...f.payload.items[0], unitPrice: '10000000000' }] },
    ])
      await post().send(payload).expect(400);
    const order = await confirmed(f);
    await post(base + '/' + order.id + '/receive')
      .send({ items: [] })
      .expect(400);
    await post(base + '/' + order.id + '/receive')
      .send({ items: [{ ...row(order, f.warehouse), lotId: randomUUID() }] })
      .expect(400);
    await get(base + '?limit=101').expect(400);
    await get(base + '/invalid').expect(400);
    await patch(order.id).send({ items: null }).expect(400);
  });
  it('allows authenticated reads and only ADMIN/COMPRAS mutations', async () => {
    const f = await fixture();
    const order = await confirmed(f);
    await kit.http().get(base).expect(401);
    for (const role of Object.values(RoleCode)) {
      await get(base, role).expect(200);
      await get(base + '/' + order.id, role).expect(200);
      await get(base + '/' + order.id + '/receipts', role).expect(200);
      if (role === 'ADMIN' || role === 'COMPRAS') {
        await post(base, role).send(f.payload).expect(201);
        continue;
      }
      await post(base, role).send(f.payload).expect(403);
      await kit
        .http()
        .patch(base + '/' + order.id)
        .set('Cookie', cookies.get(role)!)
        .send({ expectedDate: null })
        .expect(403);
      for (const action of ['confirm', 'cancel', 'receive'])
        await post(base + '/' + order.id + '/' + action, role)
          .send(action === 'receive' ? { items: [row(order, f.warehouse)] } : {})
          .expect(403);
    }
  });
  it('allocates unique OC and REC/LOT numbers concurrently on different orders', async () => {
    const f = await fixture(true);
    const orders = await Promise.all(
      [1, 2, 3, 4].map(async () => data(await post().send(f.payload).expect(201))),
    );
    expect(new Set(orders.map((o) => o.number)).size).toBe(4);
    await Promise.all(
      orders.map((o) =>
        post(base + '/' + o.id + '/confirm')
          .send({})
          .expect(200),
      ),
    );
    const receipts = await Promise.all(
      orders.map(async (o) =>
        data(
          await post(base + '/' + o.id + '/receive')
            .send({ items: [row(o, f.warehouse, '10'), row(o, f.warehouse, '20')] })
            .expect(201),
        ),
      ),
    );
    expect(new Set(receipts.map((o) => o.receipts[0].number)).size).toBe(4);
    const codes = receipts.flatMap((o) => o.receipts[0].items.map((i) => i.lot!.code));
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) expect(code).toMatch(/^LOT-\d{4}-\d{6,}$/);
    await reconcile(f.products);
  });
  it('rejects reception after supplier deactivation and rolls back completely', async () => {
    const f = await fixture();
    const order = await confirmed(f);
    await kit.prisma.supplier.update({ where: { id: f.supplier.id }, data: { isActive: false } });
    const before = await snapshot(order, f.products);
    await post(base + '/' + order.id + '/receive')
      .send({ items: [row(order, f.warehouse)] })
      .expect(409);
    expect(await snapshot(order, f.products)).toEqual(before);
  });
  it('InventoryService rejects mismatched receipt product, warehouse, quantity, origin and existing lot', async () => {
    const f = await fixture();
    const order = await confirmed(f);
    const other = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const receipt = await kit.prisma.purchaseReceipt.create({
      data: {
        number: 'REC-CONTRACT-' + randomUUID(),
        purchaseOrderId: order.id,
        receivedAt: new Date(),
        receivedByUserId: actor.id,
        items: {
          create: {
            purchaseOrderItemId: order.items[0].id,
            productId: f.products[0].id,
            warehouseId: f.warehouse.id,
            quantity: '10',
          },
        },
      },
      include: { items: true },
    });
    const origin = {
      kind: 'PURCHASE_RECEIPT' as const,
      purchaseReceiptItemId: receipt.items[0].id,
    };
    const line = {
      type: 'PURCHASE_RECEIPT' as const,
      productId: f.products[0].id,
      warehouseId: f.warehouse.id,
      quantity: '10',
      origin,
    };
    const before = await snapshot(order, f.products);
    const inventory = kit.app.get(InventoryService);
    for (const incorrect of [
      { ...line, productId: other.id },
      { ...line, warehouseId: warehouse.id },
      { ...line, quantity: '9' },
      { ...line, origin: { ...origin, purchaseReceiptItemId: randomUUID() } },
      { ...line, lotId: randomUUID() },
      {
        ...line,
        newLot: {
          code: 'LOT-2026-000001',
          status: 'RELEASED' as const,
          purchaseReceiptItemId: origin.purchaseReceiptItemId,
        },
      },
    ])
      await expect(
        kit.prisma.$transaction((tx) =>
          inventory.applyMovements(tx, { performedByUserId: actor.id, lines: [incorrect] }),
        ),
      ).rejects.toThrow();
    expect(await snapshot(order, f.products)).toEqual(before);
  });
  it('PostgreSQL protects receipt product/origin uniqueness, signs and append-only ledger', async () => {
    const f = await fixture(true);
    const order = await confirmed(f);
    const result = data(
      await post(base + '/' + order.id + '/receive')
        .send({ items: [row(order, f.warehouse)] })
        .expect(201),
    );
    const receiptItem = result.receipts[0].items[0];
    const movement = await kit.prisma.inventoryMovement.findUniqueOrThrow({
      where: { purchaseReceiptItemId: receiptItem.id },
    });
    const { id: _id, ...duplicate } = movement;
    await expect(kit.prisma.inventoryMovement.create({ data: duplicate })).rejects.toThrow();
    await expect(
      kit.prisma.inventoryMovement.update({ where: { id: movement.id }, data: { quantity: '1' } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      kit.prisma.inventoryMovement.delete({ where: { id: movement.id } }),
    ).rejects.toThrow(/append-only/);
    const other = await createInventoryProduct(kit.prisma);
    await expect(
      kit.prisma.purchaseReceiptItem.create({
        data: {
          purchaseReceiptId: result.receipts[0].id,
          purchaseOrderItemId: order.items[0].id,
          productId: other.id,
          warehouseId: f.warehouse.id,
          quantity: '1',
        },
      }),
    ).rejects.toThrow();
    await expect(
      kit.prisma.lot.create({
        data: {
          code: 'BAD-' + randomUUID(),
          productId: f.products[0].id,
          status: 'RELEASED',
          originatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      kit.prisma.lot.create({
        data: {
          code: 'DUP-' + randomUUID(),
          productId: f.products[0].id,
          status: 'RELEASED',
          originatedAt: new Date(),
          purchaseReceiptItemId: receiptItem.id,
        },
      }),
    ).rejects.toThrow();
    for (const values of [
      { type: 'ADJUSTMENT_IN' as const, reason: null, purchaseReceiptItemId: null, quantity: '1' },
      {
        type: 'PURCHASE_RECEIPT' as const,
        reason: null,
        purchaseReceiptItemId: null,
        quantity: '1',
      },
      {
        type: 'PURCHASE_RECEIPT' as const,
        reason: 'CORRECTION' as const,
        purchaseReceiptItemId: receiptItem.id,
        quantity: '-1',
      },
    ])
      await expect(
        kit.prisma.inventoryMovement.create({
          data: {
            productId: f.products[0].id,
            warehouseId: f.warehouse.id,
            performedByUserId: actor.id,
            ...values,
          },
        }),
      ).rejects.toThrow();
  });
});
