import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service.js';
import { InventoryService } from '../src/inventory/movements/inventory.service.js';
import {
  ActorType,
  AdjustmentReason,
  AuditAction,
  AuditEntityType,
  DocumentType,
  InventoryMovementType,
  ProductType,
  RoleCode,
} from '../src/generated/prisma/client.js';
import {
  createInventoryLot,
  createInventoryProduct,
  createInventoryWarehouse,
} from './support/inventory-fixtures.js';
import {
  createTestApp,
  createUser,
  login,
  type TestApp,
  type TestUser,
} from './support/auth-test-kit.js';
import { randomUUID } from 'node:crypto';

type SaleOrderBody = {
  data: {
    id: string;
    number: string;
    status: string;
    total: string;
    itemsCount: number;
    items: { quantity: string; unitPrice: string; lineTotal: string; availableQuantity?: string }[];
  };
  message: string;
};
function orderBody(response: { body: unknown }): SaleOrderBody {
  return response.body as SaleOrderBody;
}
function listBody(response: { body: unknown }): {
  data: { id: string }[];
  meta: { page: number; limit: number; total: number };
} {
  return response.body as {
    data: { id: string }[];
    meta: { page: number; limit: number; total: number };
  };
}
let kit: TestApp;
let actor: TestUser;
let cookie: string;
let inventory: InventoryService;

beforeAll(async () => {
  kit = await createTestApp();
  actor = await createUser(kit, RoleCode.VENTAS);
  cookie = await login(kit, actor);
  inventory = kit.app.get(InventoryService);
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (kit) await kit.close();
});

async function customer() {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  return kit.prisma.customer.create({ data: { code: `SO-${suffix}`, name: `Cliente ${suffix}` } });
}
async function finishedProduct(tracked = false) {
  const product = await createInventoryProduct(kit.prisma, { isLotTracked: tracked });
  return kit.prisma.product.update({
    where: { id: product.id },
    data: { type: ProductType.FINISHED_GOOD },
  });
}
async function addStock(productId: string, warehouseId: string, quantity: string, lotId?: string) {
  return kit.prisma.$transaction((tx) =>
    inventory.applyMovements(tx, {
      performedByUserId: actor.id,
      lines: [
        {
          type: InventoryMovementType.ADJUSTMENT_IN,
          productId,
          warehouseId,
          lotId,
          quantity,
          origin: { kind: 'ADJUSTMENT', reason: AdjustmentReason.INITIAL_LOAD },
        },
      ],
    }),
  );
}
function payload(customerId: string, productId: string, quantity = '2', unitPrice = '10') {
  return { customerId, items: [{ productId, quantity, unitPrice }] };
}
function auditFor(response: { headers: Record<string, unknown> }) {
  return kit.prisma.auditLog.findMany({
    where: { requestId: response.headers['x-request-id'] as string },
  });
}
async function inventorySnapshot(productId: string) {
  const [balances, movements, lots] = await Promise.all([
    kit.prisma.stockBalance.findMany({ where: { productId }, orderBy: { id: 'asc' } }),
    kit.prisma.inventoryMovement.findMany({ where: { productId }, orderBy: { id: 'asc' } }),
    kit.prisma.lot.findMany({ where: { productId }, orderBy: { id: 'asc' } }),
  ]);
  return { balances, movements, lots };
}

describe('Órdenes de venta RF-VEN-002', () => {
  it('crea un borrador OV con precios decimales y audit CREATE', async () => {
    const client = await customer();
    const product = await finishedProduct();
    const response = await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(client.id, product.id, '2.5', '1.235'))
      .expect(201);
    expect(orderBody(response).data.number).toMatch(/^OV-\d{4}-\d{6}$/);
    expect(orderBody(response).data).toMatchObject({ status: 'DRAFT', total: '3.09' });
    expect(orderBody(response).data.items[0]).toMatchObject({
      quantity: '2.5000',
      unitPrice: '1.2350',
      lineTotal: '3.09',
    });
    const logs = await auditFor(response);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorType: ActorType.USER,
      actorUserId: actor.id,
      action: AuditAction.CREATE,
      entityType: AuditEntityType.SALES_ORDER,
      entityId: orderBody(response).data.id,
    });
  });

  it('rechaza referencias, productos no vendibles y cantidades inválidas', async () => {
    const client = await customer();
    const raw = await createInventoryProduct(kit.prisma);
    await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(client.id, raw.id))
      .expect(422);
    const finished = await finishedProduct();
    await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(client.id, finished.id, '0'))
      .expect(400);
    await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(randomUUID(), finished.id))
      .expect(404);
  });

  it('edita solo DRAFT y lista por búsqueda, estado y cliente con paginación', async () => {
    const client = await customer();
    const product = await finishedProduct();
    const created = await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(client.id, product.id))
      .expect(201);
    const updated = await kit
      .http()
      .patch(`/api/sales/orders/${orderBody(created).data.id}`)
      .set('Cookie', cookie)
      .send({ items: [{ productId: product.id, quantity: '3', unitPrice: '4' }] })
      .expect(200);
    expect(orderBody(updated).data.total).toBe('12.00');
    const listed = await kit
      .http()
      .get(
        `/api/sales/orders?search=${orderBody(created).data.number}&customerId=${client.id}&status=DRAFT&page=1&limit=1`,
      )
      .set('Cookie', cookie)
      .expect(200);
    expect(listBody(listed)).toMatchObject({
      meta: { page: 1, limit: 1, total: 1 },
      data: [{ id: orderBody(created).data.id }],
    });
    await kit
      .http()
      .post(`/api/sales/orders/${orderBody(created).data.id}/cancel`)
      .set('Cookie', cookie)
      .expect(200);
    await kit
      .http()
      .patch(`/api/sales/orders/${orderBody(created).data.id}`)
      .set('Cookie', cookie)
      .send({ customerId: client.id })
      .expect(409);
  });

  it('no confirma si la disponibilidad es insuficiente y no altera el inventario', async () => {
    const client = await customer();
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await addStock(product.id, warehouse.id, '1');
    const created = await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(client.id, product.id, '2'))
      .expect(201);
    const before = await kit.prisma.stockBalance.findMany({ where: { productId: product.id } });
    const response = await kit
      .http()
      .post(`/api/sales/orders/${orderBody(created).data.id}/confirm`)
      .set('Cookie', cookie)
      .expect(409);
    expect(orderBody(response).message).toMatch(/insuficiente/i);
    expect(
      await kit.prisma.saleOrder.findUniqueOrThrow({ where: { id: orderBody(created).data.id } }),
    ).toMatchObject({ status: 'DRAFT' });
    expect(await kit.prisma.stockBalance.findMany({ where: { productId: product.id } })).toEqual(
      before,
    );
  });

  it('confirma con stock, filtra lotes no liberados y no reserva ni mueve inventario', async () => {
    const client = await customer();
    const product = await finishedProduct(true);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const released = await createInventoryLot(kit.prisma, product.id);
    const quarantined = await createInventoryLot(kit.prisma, product.id, 'QUARANTINED');
    const rejected = await createInventoryLot(kit.prisma, product.id, 'REJECTED');
    await addStock(product.id, warehouse.id, '3', released.id);
    await addStock(product.id, warehouse.id, '10', quarantined.id);
    await addStock(product.id, warehouse.id, '20', rejected.id);
    const created = await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(client.id, product.id, '2'))
      .expect(201);
    const balancesBefore = await kit.prisma.stockBalance.findMany({
      where: { productId: product.id },
    });
    const movementsBefore = await kit.prisma.inventoryMovement.count({
      where: { productId: product.id },
    });
    const confirmed = await kit
      .http()
      .post(`/api/sales/orders/${orderBody(created).data.id}/confirm`)
      .set('Cookie', cookie)
      .expect(200);
    expect(orderBody(confirmed).data.status).toBe('CONFIRMED');
    expect(await kit.prisma.stockBalance.findMany({ where: { productId: product.id } })).toEqual(
      balancesBefore,
    );
    expect(await kit.prisma.inventoryMovement.count({ where: { productId: product.id } })).toBe(
      movementsBefore,
    );
    const details = await kit
      .http()
      .get(`/api/sales/orders/${orderBody(created).data.id}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(orderBody(details).data.items[0].availableQuantity).toBe('3.0000');
    const logs = await auditFor(confirmed);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: AuditAction.CONFIRM,
      previousValues: { status: 'DRAFT' },
      newValues: { status: 'CONFIRMED' },
    });
  });

  it('cancela DRAFT y CONFIRMED, y rechaza confirmar dos veces', async () => {
    const client = await customer();
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await addStock(product.id, warehouse.id, '20');
    const draft = await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(client.id, product.id))
      .expect(201);
    await kit
      .http()
      .post(`/api/sales/orders/${orderBody(draft).data.id}/cancel`)
      .set('Cookie', cookie)
      .expect(200);
    const confirmed = await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(client.id, product.id))
      .expect(201);
    await kit
      .http()
      .post(`/api/sales/orders/${orderBody(confirmed).data.id}/confirm`)
      .set('Cookie', cookie)
      .expect(200);
    await kit
      .http()
      .post(`/api/sales/orders/${orderBody(confirmed).data.id}/confirm`)
      .set('Cookie', cookie)
      .expect(409);
    await kit
      .http()
      .patch(`/api/sales/orders/${orderBody(confirmed).data.id}`)
      .set('Cookie', cookie)
      .send({ items: [{ productId: product.id, quantity: '3', unitPrice: '10' }] })
      .expect(409);
    await kit
      .http()
      .post(`/api/sales/orders/${orderBody(confirmed).data.id}/cancel`)
      .set('Cookie', cookie)
      .expect(200);
    await kit
      .http()
      .post(`/api/sales/orders/${orderBody(confirmed).data.id}/cancel`)
      .set('Cookie', cookie)
      .expect(409);
  });

  it('valida decimales, redondeo HALF_UP y overflow de lineTotal', async () => {
    const client = await customer();
    const product = await finishedProduct();
    const send = (quantity: string, unitPrice: string) =>
      kit
        .http()
        .post('/api/sales/orders')
        .set('Cookie', cookie)
        .send(payload(client.id, product.id, quantity, unitPrice));

    await send('1.12345', '1').expect(400);
    await send('0', '1').expect(400);
    await send('-1', '1').expect(400);
    await send('1', '1.12345').expect(400);
    await send('1', '-1').expect(400);
    await send('1000000', '1000000').expect(422);
    const rounded = await send('1', '1.235').expect(201);
    expect(orderBody(rounded).data.items[0].lineTotal).toBe('1.24');
    const maxQuantity = await send('99999999999999.9999', '0').expect(201);
    expect(orderBody(maxQuantity).data.items[0].quantity).toBe('99999999999999.9999');
  });

  it('mantiene intacto el inventario al crear y editar un borrador', async () => {
    const client = await customer();
    const product = await finishedProduct(true);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const lot = await createInventoryLot(kit.prisma, product.id);
    await addStock(product.id, warehouse.id, '5', lot.id);
    const before = await inventorySnapshot(product.id);
    const created = await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(client.id, product.id))
      .expect(201);
    const id = orderBody(created).data.id;
    await kit
      .http()
      .patch(`/api/sales/orders/${id}`)
      .set('Cookie', cookie)
      .send({ items: [{ productId: product.id, quantity: '3', unitPrice: '4' }] })
      .expect(200);
    await kit.http().post(`/api/sales/orders/${id}/confirm`).set('Cookie', cookie).expect(200);
    await kit.http().post(`/api/sales/orders/${id}/cancel`).set('Cookie', cookie).expect(200);
    expect(await inventorySnapshot(product.id)).toEqual(before);
  });

  it('rechaza cliente inactivo, productos inactivos o inexistentes e items vacíos', async () => {
    const client = await customer();
    const activeProduct = await finishedProduct();
    await kit.prisma.customer.update({ where: { id: client.id }, data: { isActive: false } });
    await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(client.id, activeProduct.id))
      .expect(422);

    const activeClient = await customer();
    const inactiveProduct = await finishedProduct();
    await kit.prisma.product.update({
      where: { id: inactiveProduct.id },
      data: { isActive: false },
    });
    await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(activeClient.id, inactiveProduct.id))
      .expect(422);
    await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(activeClient.id, randomUUID()))
      .expect(404);
    await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send({ customerId: activeClient.id, items: [] })
      .expect(400);
  });

  it('rechaza confirmar si el cliente o producto fue desactivado después del borrador', async () => {
    const client = await customer();
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await addStock(product.id, warehouse.id, '20');
    const draftWithClient = await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(client.id, product.id))
      .expect(201);
    const clientInventoryBefore = await inventorySnapshot(product.id);
    await kit.prisma.customer.update({ where: { id: client.id }, data: { isActive: false } });
    await kit
      .http()
      .post(`/api/sales/orders/${orderBody(draftWithClient).data.id}/confirm`)
      .set('Cookie', cookie)
      .expect(422);
    expect(await inventorySnapshot(product.id)).toEqual(clientInventoryBefore);
    expect(
      (
        await kit.prisma.saleOrder.findUniqueOrThrow({
          where: { id: orderBody(draftWithClient).data.id },
        })
      ).status,
    ).toBe('DRAFT');

    const otherClient = await customer();
    const draftWithProduct = await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(otherClient.id, product.id))
      .expect(201);
    const productInventoryBefore = await inventorySnapshot(product.id);
    await kit.prisma.product.update({ where: { id: product.id }, data: { isActive: false } });
    await kit
      .http()
      .post(`/api/sales/orders/${orderBody(draftWithProduct).data.id}/confirm`)
      .set('Cookie', cookie)
      .expect(422);
    expect(await inventorySnapshot(product.id)).toEqual(productInventoryBefore);
    expect(
      (
        await kit.prisma.saleOrder.findUniqueOrThrow({
          where: { id: orderBody(draftWithProduct).data.id },
        })
      ).status,
    ).toBe('DRAFT');
  });

  it('prueba el contrato de líneas repetidas agregándolas antes de validar disponibilidad', async () => {
    const client = await customer();
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await addStock(product.id, warehouse.id, '10');
    const repeatedOver = await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send({
        customerId: client.id,
        items: [
          { productId: product.id, quantity: '6', unitPrice: '1' },
          { productId: product.id, quantity: '6', unitPrice: '1' },
        ],
      })
      .expect(201);
    await kit
      .http()
      .post(`/api/sales/orders/${orderBody(repeatedOver).data.id}/confirm`)
      .set('Cookie', cookie)
      .expect(409);
    const exact = await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send({
        customerId: client.id,
        items: [
          { productId: product.id, quantity: '4', unitPrice: '1' },
          { productId: product.id, quantity: '6', unitPrice: '1' },
        ],
      })
      .expect(201);
    await kit
      .http()
      .post(`/api/sales/orders/${orderBody(exact).data.id}/confirm`)
      .set('Cookie', cookie)
      .expect(200);
  });

  it('serializa confirmaciones concurrentes y registra una sola transición', async () => {
    const client = await customer();
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await addStock(product.id, warehouse.id, '20');
    const created = await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(client.id, product.id))
      .expect(201);
    const id = orderBody(created).data.id;
    const responses = await Promise.all([
      kit.http().post(`/api/sales/orders/${id}/confirm`).set('Cookie', cookie),
      kit.http().post(`/api/sales/orders/${id}/confirm`).set('Cookie', cookie),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await kit.prisma.saleOrder.findUniqueOrThrow({ where: { id } })).status).toBe(
      'CONFIRMED',
    );
    expect(
      await kit.prisma.auditLog.count({
        where: {
          entityType: AuditEntityType.SALES_ORDER,
          entityId: id,
          action: AuditAction.CONFIRM,
        },
      }),
    ).toBe(1);
  });

  it('numera diez órdenes concurrentes con códigos OV únicos y contiguos', async () => {
    const client = await customer();
    const product = await finishedProduct();
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        kit
          .http()
          .post('/api/sales/orders')
          .set('Cookie', cookie)
          .send(payload(client.id, product.id)),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual(Array(10).fill(201));
    const codes = responses.map((response) => orderBody(response).data.number);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => /^OV-\d{4}-\d{6}$/.test(code))).toBe(true);
    const numbers = codes.map((code) => Number(code.slice(-6))).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 10 }, (_, i) => numbers[0] + i));
  });

  it('revierte UPDATE, CONFIRM y CANCEL si falla la auditoría', async () => {
    const client = await customer();
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await addStock(product.id, warehouse.id, '20');
    const created = await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(client.id, product.id))
      .expect(201);
    const id = orderBody(created).data.id;
    const audit = kit.app.get(AuditService);

    const originalItems = await kit.prisma.saleOrderItem.findMany({
      where: { saleOrderId: id },
      orderBy: { id: 'asc' },
    });
    const unchangedInventory = await inventorySnapshot(product.id);
    vi.spyOn(audit, 'record').mockRejectedValueOnce(new Error('Fallo UPDATE'));
    await kit
      .http()
      .patch(`/api/sales/orders/${id}`)
      .set('Cookie', cookie)
      .send({ items: [{ productId: product.id, quantity: '7', unitPrice: '3' }] })
      .expect(500);
    expect(
      await kit.prisma.saleOrderItem.findMany({
        where: { saleOrderId: id },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(originalItems);

    vi.spyOn(audit, 'record').mockRejectedValueOnce(new Error('Fallo CONFIRM'));
    await kit.http().post(`/api/sales/orders/${id}/confirm`).set('Cookie', cookie).expect(500);
    expect((await kit.prisma.saleOrder.findUniqueOrThrow({ where: { id } })).status).toBe('DRAFT');

    await kit.http().post(`/api/sales/orders/${id}/confirm`).set('Cookie', cookie).expect(200);
    vi.spyOn(audit, 'record').mockRejectedValueOnce(new Error('Fallo CANCEL'));
    await kit.http().post(`/api/sales/orders/${id}/cancel`).set('Cookie', cookie).expect(500);
    expect((await kit.prisma.saleOrder.findUniqueOrThrow({ where: { id } })).status).toBe(
      'CONFIRMED',
    );
    expect(await inventorySnapshot(product.id)).toEqual(unchangedInventory);
  });

  it('devuelve clientes activos filtrados por código/nombre y pagina', async () => {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const first = await kit.prisma.customer.create({
      data: { code: `FIND-${suffix}`, name: `Cliente Alfa ${suffix}` },
    });
    await kit.prisma.customer.create({
      data: { code: `OTHER-${suffix}`, name: `Cliente Beta ${suffix}` },
    });
    await kit.prisma.customer.create({
      data: { code: `OFF-${suffix}`, name: `Cliente Alfa Inactivo ${suffix}`, isActive: false },
    });
    const response = await kit
      .http()
      .get(`/api/customers?search=${suffix}&isActive=true&page=1&limit=1`)
      .set('Cookie', cookie)
      .expect(200);
    const customerList = response.body as unknown as {
      meta: { page: number; limit: number; total: number };
      data: { id: string; code: string; isActive: boolean }[];
    };
    expect(customerList.meta).toMatchObject({ page: 1, limit: 1, total: 2 });
    expect(customerList.data).toHaveLength(1);
    expect(customerList.data[0].isActive).toBe(true);
    expect([`FIND-${suffix}`, `OTHER-${suffix}`]).toContain(customerList.data[0].code);
    const byCode = await kit
      .http()
      .get(`/api/customers?search=${first.code}&isActive=true`)
      .set('Cookie', cookie)
      .expect(200);
    const byCodeData = (byCode.body as unknown as { data: { id: string }[] }).data;
    expect(byCodeData.map((row) => row.id)).toContain(first.id);
  });

  it('restringe mutaciones a ADMIN y VENTAS, y revierte si falla auditoría', async () => {
    const client = await customer();
    const product = await finishedProduct();
    const inventoryUser = await createUser(kit, RoleCode.INVENTARIO);
    const inventoryCookie = await login(kit, inventoryUser);
    await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', inventoryCookie)
      .send(payload(client.id, product.id))
      .expect(403);
    for (const role of [RoleCode.COMPRAS, RoleCode.PRODUCCION]) {
      const user = await createUser(kit, role);
      const roleCookie = await login(kit, user);
      await kit
        .http()
        .post('/api/sales/orders')
        .set('Cookie', roleCookie)
        .send(payload(client.id, product.id))
        .expect(403);
    }
    const beforeCount = await kit.prisma.saleOrder.count();
    const sequenceBefore = await kit.prisma.documentSequence.findMany({
      where: { documentType: DocumentType.SALE_ORDER },
      orderBy: { year: 'asc' },
    });
    const audit = kit.app.get(AuditService);
    vi.spyOn(audit, 'record').mockRejectedValueOnce(
      new Error('Fallo simulado de auditoría de ventas'),
    );
    await kit
      .http()
      .post('/api/sales/orders')
      .set('Cookie', cookie)
      .send(payload(client.id, product.id))
      .expect(500);
    expect(await kit.prisma.saleOrder.count()).toBe(beforeCount);
    expect(
      await kit.prisma.documentSequence.findMany({
        where: { documentType: DocumentType.SALE_ORDER },
        orderBy: { year: 'asc' },
      }),
    ).toEqual(sequenceBefore);
  });
});
