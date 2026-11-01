import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service.js';
import { InventoryService } from '../src/inventory/movements/inventory.service.js';
import { InventoryErrorCode } from '../src/inventory/movements/inventory-errors.js';
import {
  AdjustmentReason,
  AuditEntityType,
  DocumentType,
  InventoryMovementType,
  LotStatus,
  ProductType,
  RoleCode,
  SaleOrderStatus,
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

let kit: TestApp;
let actor: TestUser;
let cookie: string;
let inventory: InventoryService;
// Supertest aplica headers al TestRequest, que se obtiene después de elegir el método.
const http = () => ({
  get: (path: string) => kit.http().get(path).set('Cookie', cookie),
  post: (path: string) => kit.http().post(path).set('Cookie', cookie),
});
type DispatchResponseBody = {
  data: {
    id: string;
    number?: string;
    status?: string;
    saleOrderStatus?: string;
    items: Array<{ id: string }>;
  };
};
function bodyData(response: { body: unknown }) {
  return (response.body as DispatchResponseBody).data;
}

beforeAll(async () => {
  kit = await createTestApp();
  actor = await createUser(kit, RoleCode.VENTAS);
  cookie = await login(kit, actor);
  inventory = kit.app.get(InventoryService);
});
afterAll(async () => {
  if (kit) await kit.close();
});
afterEach(() => vi.restoreAllMocks());

async function customer() {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  return kit.prisma.customer.create({ data: { code: `DIS-${suffix}`, name: `Cliente ${suffix}` } });
}
async function finishedProduct(tracked = false) {
  const product = await createInventoryProduct(kit.prisma, { isLotTracked: tracked });
  return kit.prisma.product.update({
    where: { id: product.id },
    data: { type: ProductType.FINISHED_GOOD },
  });
}
async function stock(productId: string, warehouseId: string, quantity: string, lotId?: string) {
  await kit.prisma.$transaction((tx) =>
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
async function removeStock(
  productId: string,
  warehouseId: string,
  quantity: string,
  lotId?: string,
) {
  await kit.prisma.$transaction((tx) =>
    inventory.applyMovements(tx, {
      performedByUserId: actor.id,
      lines: [
        {
          type: InventoryMovementType.ADJUSTMENT_OUT,
          productId,
          warehouseId,
          lotId,
          quantity,
          origin: { kind: 'ADJUSTMENT', reason: AdjustmentReason.DAMAGE },
        },
      ],
    }),
  );
}
async function confirmedOrder(productId: string, quantity: string) {
  const client = await customer();
  const created = await http()
    .post('/api/sales/orders')
    .send({ customerId: client.id, items: [{ productId, quantity, unitPrice: '1' }] })
    .expect(201);
  const createdData = bodyData(created);
  const id = createdData.id;
  const itemId = createdData.items[0].id;
  await http().post(`/api/sales/orders/${id}/confirm`).send({}).expect(200);
  return { id, itemId };
}
async function confirmedOrderWithoutInventory(productId: string, quantity: string) {
  const client = await customer();
  const created = await http()
    .post('/api/sales/orders')
    .send({ customerId: client.id, items: [{ productId, quantity, unitPrice: '1' }] })
    .expect(201);
  const data = bodyData(created);
  await kit.prisma.saleOrder.update({
    where: { id: data.id },
    data: { status: SaleOrderStatus.CONFIRMED },
  });
  return { id: data.id, itemId: data.items[0].id };
}

describe('Despachos de venta RF-VEN-003', () => {
  it('revierte el saldo inicial creado al fallar un despacho sin existencia', async () => {
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const order = await confirmedOrderWithoutInventory(product.id, '2');
    const beforeSequence = await kit.prisma.documentSequence.findMany({
      where: { documentType: DocumentType.SALE_DISPATCH },
    });

    const response = await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [{ saleOrderItemId: order.itemId, warehouseId: warehouse.id, quantity: '1' }],
      })
      .expect(409);

    expect(response.body).toMatchObject({ code: InventoryErrorCode.INSUFFICIENT_STOCK });
    expect(
      await kit.prisma.stockBalance.findUnique({
        where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
      }),
    ).toBeNull();
    expect(await kit.prisma.saleDispatch.count({ where: { saleOrderId: order.id } })).toBe(0);
    expect(await kit.prisma.saleDispatchItem.count({ where: { saleOrderId: order.id } })).toBe(0);
    expect(
      await kit.prisma.inventoryMovement.count({
        where: { productId: product.id, type: InventoryMovementType.SALE_DISPATCH },
      }),
    ).toBe(0);
    expect((await kit.prisma.saleOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      SaleOrderStatus.CONFIRMED,
    );
    expect(
      await kit.prisma.documentSequence.findMany({
        where: { documentType: DocumentType.SALE_DISPATCH },
      }),
    ).toEqual(beforeSequence);
  });

  it('serializa despachos concurrentes cuando el saldo todavía no existe', async () => {
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const orders = await Promise.all([
      confirmedOrderWithoutInventory(product.id, '2'),
      confirmedOrderWithoutInventory(product.id, '2'),
    ]);
    const results = await Promise.all(
      orders.map((order) =>
        http()
          .post(`/api/sales/orders/${order.id}/dispatch`)
          .send({
            items: [{ saleOrderItemId: order.itemId, warehouseId: warehouse.id, quantity: '1' }],
          }),
      ),
    );

    expect(results.map((result) => result.status)).toEqual([409, 409]);
    expect(
      await kit.prisma.saleDispatch.count({
        where: { saleOrderId: { in: orders.map((o) => o.id) } },
      }),
    ).toBe(0);
    expect(
      await kit.prisma.stockBalance.findUnique({
        where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
      }),
    ).toBeNull();
  });

  it('falla limpiamente para lote RELEASED cuando aún no existe saldo general', async () => {
    const product = await finishedProduct(true);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const lot = await createInventoryLot(kit.prisma, product.id, LotStatus.RELEASED);
    const order = await confirmedOrderWithoutInventory(product.id, '1');

    const response = await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [
          {
            saleOrderItemId: order.itemId,
            warehouseId: warehouse.id,
            lotId: lot.id,
            quantity: '1',
          },
        ],
      })
      .expect(409);

    expect(response.body).toMatchObject({ code: InventoryErrorCode.INSUFFICIENT_STOCK });
    expect(await kit.prisma.saleDispatch.count({ where: { saleOrderId: order.id } })).toBe(0);
    expect(
      await kit.prisma.stockBalance.findUnique({
        where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
      }),
    ).toBeNull();
    expect((await kit.prisma.saleOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      SaleOrderStatus.CONFIRMED,
    );
  });

  it('devuelve error de referencia controlado para un almacén inexistente', async () => {
    const product = await finishedProduct();
    const order = await confirmedOrderWithoutInventory(product.id, '1');
    const beforeSequence = await kit.prisma.documentSequence.findMany({
      where: { documentType: DocumentType.SALE_DISPATCH },
    });

    const response = await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [{ saleOrderItemId: order.itemId, warehouseId: randomUUID(), quantity: '1' }],
      })
      .expect(422);

    expect(response.body).toMatchObject({ code: InventoryErrorCode.REFERENCE_NOT_FOUND });
    expect(await kit.prisma.saleDispatch.count({ where: { saleOrderId: order.id } })).toBe(0);
    expect(await kit.prisma.saleDispatchItem.count({ where: { saleOrderId: order.id } })).toBe(0);
    expect(await kit.prisma.inventoryMovement.count({ where: { productId: product.id } })).toBe(0);
    expect((await kit.prisma.saleOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      SaleOrderStatus.CONFIRMED,
    );
    expect(
      await kit.prisma.documentSequence.findMany({
        where: { documentType: DocumentType.SALE_DISPATCH },
      }),
    ).toEqual(beforeSequence);
  });

  it('registra despachos parciales y completa el estado sin exceder la orden', async () => {
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await stock(product.id, warehouse.id, '8');
    const order = await confirmedOrder(product.id, '5');

    const first = await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [{ saleOrderItemId: order.itemId, warehouseId: warehouse.id, quantity: '2' }],
      })
      .expect(200);
    const firstData = bodyData(first);
    expect(firstData.number).toMatch(/^DES-\d{4}-\d{6}$/);
    expect(firstData.saleOrderStatus).toBe(SaleOrderStatus.PARTIALLY_DISPATCHED);
    expect(firstData.items).toHaveLength(1);

    await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [{ saleOrderItemId: order.itemId, warehouseId: warehouse.id, quantity: '3' }],
      })
      .expect(200);
    const detail = await http().get(`/api/sales/orders/${order.id}`).expect(200);
    expect(bodyData(detail).status).toBe(SaleOrderStatus.DISPATCHED);
    const actorRecord = await kit.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { fullName: true },
    });
    expect(
      (
        bodyData(detail) as DispatchResponseBody['data'] & {
          dispatches?: Array<{ createdBy: { fullName: string } }>;
        }
      ).dispatches?.[0]?.createdBy.fullName,
    ).toBe(actorRecord.fullName);
    const movements = await http()
      .get(`/api/inventory/movements?productId=${product.id}&type=SALE_DISPATCH`)
      .expect(200);
    const movementRows = (movements.body as { data: Array<{ businessReference: unknown }> }).data;
    expect(movementRows).toHaveLength(2);
    expect(movementRows[0].businessReference).toMatchObject({
      type: 'SALE_DISPATCH',
      saleOrder: { id: order.id },
    });
    expect(
      await kit.prisma.inventoryMovement.count({
        where: { productId: product.id, type: InventoryMovementType.SALE_DISPATCH },
      }),
    ).toBe(2);
    expect(
      (
        await kit.prisma.stockBalance.findUniqueOrThrow({
          where: {
            productId_warehouseId: {
              productId: product.id,
              warehouseId: warehouse.id,
            },
          },
        })
      ).quantity.toString(),
    ).toBe('3');
  });

  it('agrega líneas repetidas antes de verificar lo pendiente y rechaza excedentes', async () => {
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await stock(product.id, warehouse.id, '10');
    const order = await confirmedOrder(product.id, '5');
    const response = await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [
          { saleOrderItemId: order.itemId, warehouseId: warehouse.id, quantity: '2' },
          { saleOrderItemId: order.itemId, warehouseId: warehouse.id, quantity: '2' },
        ],
      })
      .expect(200);
    expect(bodyData(response).items).toHaveLength(1);
    await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [{ saleOrderItemId: order.itemId, warehouseId: warehouse.id, quantity: '2' }],
      })
      .expect(409);
  });

  it('requiere lote RELEASED para producto trazable y deja intacta la orden si falla', async () => {
    const product = await finishedProduct(true);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const quarantined = await createInventoryLot(kit.prisma, product.id, LotStatus.QUARANTINED);
    const rejected = await createInventoryLot(kit.prisma, product.id, LotStatus.REJECTED);
    const released = await createInventoryLot(kit.prisma, product.id, LotStatus.RELEASED);
    await stock(product.id, warehouse.id, '4', quarantined.id);
    await stock(product.id, warehouse.id, '3', rejected.id);
    await stock(product.id, warehouse.id, '2', released.id);
    const order = await confirmedOrder(product.id, '2');
    await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [
          {
            saleOrderItemId: order.itemId,
            warehouseId: warehouse.id,
            lotId: quarantined.id,
            quantity: '1',
          },
        ],
      })
      .expect(409);
    await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [
          {
            saleOrderItemId: order.itemId,
            warehouseId: warehouse.id,
            lotId: rejected.id,
            quantity: '1',
          },
        ],
      })
      .expect(409);
    expect((await kit.prisma.saleOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      SaleOrderStatus.CONFIRMED,
    );
    expect(await kit.prisma.saleDispatch.count({ where: { saleOrderId: order.id } })).toBe(0);
  });

  it('exige lote para producto trazable y prohíbe lote para producto no trazable', async () => {
    const tracked = await finishedProduct(true);
    const untracked = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const lot = await createInventoryLot(kit.prisma, untracked.id, LotStatus.RELEASED);
    const trackedLot = await createInventoryLot(kit.prisma, tracked.id);
    await stock(tracked.id, warehouse.id, '2', trackedLot.id);
    await stock(untracked.id, warehouse.id, '2');
    const trackedOrder = await confirmedOrder(tracked.id, '1');
    const untrackedOrder = await confirmedOrder(untracked.id, '1');

    await http()
      .post(`/api/sales/orders/${trackedOrder.id}/dispatch`)
      .send({
        items: [{ saleOrderItemId: trackedOrder.itemId, warehouseId: warehouse.id, quantity: '1' }],
      })
      .expect(422);
    await http()
      .post(`/api/sales/orders/${untrackedOrder.id}/dispatch`)
      .send({
        items: [
          {
            saleOrderItemId: untrackedOrder.itemId,
            warehouseId: warehouse.id,
            lotId: lot.id,
            quantity: '1',
          },
        ],
      })
      .expect(422);
    expect(
      await kit.prisma.saleDispatch.count({
        where: { saleOrderId: { in: [trackedOrder.id, untrackedOrder.id] } },
      }),
    ).toBe(0);
  });

  it('rechaza un lote sin saldo en el almacén solicitado', async () => {
    const product = await finishedProduct(true);
    const stockedWarehouse = await createInventoryWarehouse(kit.prisma);
    const otherWarehouse = await createInventoryWarehouse(kit.prisma);
    const lot = await createInventoryLot(kit.prisma, product.id, LotStatus.RELEASED);
    await stock(product.id, stockedWarehouse.id, '2', lot.id);
    const order = await confirmedOrder(product.id, '1');

    await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [
          {
            saleOrderItemId: order.itemId,
            warehouseId: otherWarehouse.id,
            lotId: lot.id,
            quantity: '1',
          },
        ],
      })
      .expect(409);
    expect(await kit.prisma.saleDispatch.count({ where: { saleOrderId: order.id } })).toBe(0);
    expect((await kit.prisma.saleOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      SaleOrderStatus.CONFIRMED,
    );
  });

  it('rechaza despacho para COMPRAS, INVENTARIO y PRODUCCION', async () => {
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await stock(product.id, warehouse.id, '2');
    const order = await confirmedOrder(product.id, '1');

    for (const role of [RoleCode.COMPRAS, RoleCode.INVENTARIO, RoleCode.PRODUCCION]) {
      const user = await createUser(kit, role);
      const roleCookie = await login(kit, user);
      await kit
        .http()
        .post(`/api/sales/orders/${order.id}/dispatch`)
        .set('Cookie', roleCookie)
        .send({
          items: [{ saleOrderItemId: order.itemId, warehouseId: warehouse.id, quantity: '1' }],
        })
        .expect(403);
    }
    expect(await kit.prisma.saleDispatch.count({ where: { saleOrderId: order.id } })).toBe(0);
  });

  it('serializa despachos concurrentes de la misma orden', async () => {
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await stock(product.id, warehouse.id, '10');
    const order = await confirmedOrder(product.id, '3');
    const send = () =>
      http()
        .post(`/api/sales/orders/${order.id}/dispatch`)
        .send({
          items: [{ saleOrderItemId: order.itemId, warehouseId: warehouse.id, quantity: '2' }],
        });
    const results = await Promise.all([send(), send()]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect((await kit.prisma.saleOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      SaleOrderStatus.PARTIALLY_DISPATCHED,
    );
    expect(await kit.prisma.saleDispatch.count({ where: { saleOrderId: order.id } })).toBe(1);
  });

  it('genera números DES únicos al despachar órdenes distintas concurrentemente', async () => {
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await stock(product.id, warehouse.id, '10');
    const orders = await Promise.all(
      Array.from({ length: 10 }, () => confirmedOrder(product.id, '1')),
    );

    const results = await Promise.all(
      orders.map((order) =>
        http()
          .post(`/api/sales/orders/${order.id}/dispatch`)
          .send({
            items: [{ saleOrderItemId: order.itemId, warehouseId: warehouse.id, quantity: '1' }],
          }),
      ),
    );
    expect(results.map((response) => response.status)).toEqual(Array(10).fill(200));
    const numbers = results.map((response) => bodyData(response).number!).sort();
    expect(new Set(numbers).size).toBe(10);
    expect(numbers.every((number) => /^DES-\d{4}-\d{6}$/.test(number))).toBe(true);
    expect(numbers).toEqual([...numbers].sort());
  });

  it('rechaza orden o líneas inexistentes y una lista vacía', async () => {
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await stock(product.id, warehouse.id, '2');
    const order = await confirmedOrder(product.id, '2');
    const base = { warehouseId: warehouse.id, quantity: '1' };

    await http()
      .post(`/api/sales/orders/${randomUUID()}/dispatch`)
      .send({ items: [{ ...base, saleOrderItemId: order.itemId }] })
      .expect(404);
    await http().post(`/api/sales/orders/${order.id}/dispatch`).send({ items: [] }).expect(400);
    await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({ items: [{ ...base, saleOrderItemId: randomUUID() }] })
      .expect(404);
    expect(await kit.prisma.saleDispatch.count({ where: { saleOrderId: order.id } })).toBe(0);
  });

  it('revierte despacho, salida, saldo, auditoría y secuencia si falla la auditoría', async () => {
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await stock(product.id, warehouse.id, '5');
    const order = await confirmedOrder(product.id, '2');
    const beforeBalance = await kit.prisma.stockBalance.findUniqueOrThrow({
      where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
    });
    const beforeMovements = await kit.prisma.inventoryMovement.count({
      where: { productId: product.id },
    });
    const beforeSequence = await kit.prisma.documentSequence.findMany({
      where: { documentType: DocumentType.SALE_DISPATCH },
    });
    const beforeAudit = await kit.prisma.auditLog.count({
      where: { entityType: AuditEntityType.SALE_DISPATCH },
    });
    vi.spyOn(kit.app.get(AuditService), 'record').mockRejectedValueOnce(
      new Error('Fallo de auditoría de despacho'),
    );

    await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [{ saleOrderItemId: order.itemId, warehouseId: warehouse.id, quantity: '1' }],
      })
      .expect(500);

    expect(await kit.prisma.saleDispatch.count({ where: { saleOrderId: order.id } })).toBe(0);
    expect(await kit.prisma.inventoryMovement.count({ where: { productId: product.id } })).toBe(
      beforeMovements,
    );
    expect(
      await kit.prisma.stockBalance.findUniqueOrThrow({
        where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
      }),
    ).toEqual(beforeBalance);
    expect(
      await kit.prisma.documentSequence.findMany({
        where: { documentType: DocumentType.SALE_DISPATCH },
      }),
    ).toEqual(beforeSequence);
    expect(
      await kit.prisma.auditLog.count({
        where: { entityType: AuditEntityType.SALE_DISPATCH },
      }),
    ).toBe(beforeAudit);
    expect((await kit.prisma.saleOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      SaleOrderStatus.CONFIRMED,
    );
  });

  it('rechaza despacho sin existencias y conserva la orden confirmada', async () => {
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    // La orden necesita disponibilidad para confirmarse; agotamos el stock antes del despacho.
    await stock(product.id, warehouse.id, '2');
    const order = await confirmedOrder(product.id, '2');
    await removeStock(product.id, warehouse.id, '2');
    await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [{ saleOrderItemId: order.itemId, warehouseId: warehouse.id, quantity: '1' }],
      })
      .expect(409);
    expect((await kit.prisma.saleOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      SaleOrderStatus.CONFIRMED,
    );
    expect(await kit.prisma.saleDispatch.count({ where: { saleOrderId: order.id } })).toBe(0);
    expect(
      await kit.prisma.inventoryMovement.count({
        where: { productId: product.id, type: InventoryMovementType.SALE_DISPATCH },
      }),
    ).toBe(0);
  });

  it('despacha una línea entre dos almacenes y conserva movimientos conciliados', async () => {
    const product = await finishedProduct();
    const firstWarehouse = await createInventoryWarehouse(kit.prisma);
    const secondWarehouse = await createInventoryWarehouse(kit.prisma);
    await stock(product.id, firstWarehouse.id, '2');
    await stock(product.id, secondWarehouse.id, '3');
    const order = await confirmedOrder(product.id, '4');
    await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [
          { saleOrderItemId: order.itemId, warehouseId: firstWarehouse.id, quantity: '2' },
          { saleOrderItemId: order.itemId, warehouseId: secondWarehouse.id, quantity: '2' },
        ],
      })
      .expect(200);
    const items = await kit.prisma.saleDispatchItem.findMany({
      where: { saleOrderId: order.id },
      orderBy: { warehouseId: 'asc' },
      include: { movement: true },
    });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.movement?.quantity.toString())).toEqual(['-2', '-2']);
    expect(
      items.every(
        (item) => item.movement?.saleDispatchItemId === item.id && item.movement.reason === null,
      ),
    ).toBe(true);
    expect(
      (
        await kit.prisma.stockBalance.findUniqueOrThrow({
          where: {
            productId_warehouseId: { productId: product.id, warehouseId: firstWarehouse.id },
          },
        })
      ).quantity.toString(),
    ).toBe('0');
    expect(
      (
        await kit.prisma.stockBalance.findUniqueOrThrow({
          where: {
            productId_warehouseId: { productId: product.id, warehouseId: secondWarehouse.id },
          },
        })
      ).quantity.toString(),
    ).toBe('1');
  });

  it('divide una asignación trazable entre lotes liberados y rechaza lote de otro producto', async () => {
    const product = await finishedProduct(true);
    const otherProduct = await finishedProduct(true);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const lotA = await createInventoryLot(kit.prisma, product.id, LotStatus.RELEASED);
    const lotB = await createInventoryLot(kit.prisma, product.id, LotStatus.RELEASED);
    const foreignLot = await createInventoryLot(kit.prisma, otherProduct.id, LotStatus.RELEASED);
    await stock(product.id, warehouse.id, '2', lotA.id);
    await stock(product.id, warehouse.id, '3', lotB.id);
    await stock(otherProduct.id, warehouse.id, '1', foreignLot.id);
    const order = await confirmedOrder(product.id, '4');
    await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [
          {
            saleOrderItemId: order.itemId,
            warehouseId: warehouse.id,
            lotId: foreignLot.id,
            quantity: '1',
          },
        ],
      })
      .expect(422);
    expect(await kit.prisma.saleDispatch.count({ where: { saleOrderId: order.id } })).toBe(0);
    await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [
          {
            saleOrderItemId: order.itemId,
            warehouseId: warehouse.id,
            lotId: lotA.id,
            quantity: '1',
          },
          {
            saleOrderItemId: order.itemId,
            warehouseId: warehouse.id,
            lotId: lotB.id,
            quantity: '3',
          },
        ],
      })
      .expect(200);
    expect(await kit.prisma.saleDispatch.count({ where: { saleOrderId: order.id } })).toBe(1);
  });

  it('serializa órdenes distintas que compiten por el mismo saldo', async () => {
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await stock(product.id, warehouse.id, '6');
    const orders = await Promise.all([
      confirmedOrder(product.id, '3'),
      confirmedOrder(product.id, '3'),
    ]);
    await removeStock(product.id, warehouse.id, '1');
    const results = await Promise.all(
      orders.map((order) =>
        http()
          .post(`/api/sales/orders/${order.id}/dispatch`)
          .send({
            items: [{ saleOrderItemId: order.itemId, warehouseId: warehouse.id, quantity: '3' }],
          }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(
      (
        await kit.prisma.stockBalance.findUniqueOrThrow({
          where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
        })
      ).quantity.toString(),
    ).toBe('2');
  });

  it.each([
    ['3', '2'],
    ['5', '0'],
  ])('serializa órdenes distintas por el mismo lote, despacho=%s', async (quantity, remaining) => {
    const product = await finishedProduct(true);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const lot = await createInventoryLot(kit.prisma, product.id, LotStatus.RELEASED);
    await stock(product.id, warehouse.id, '6', lot.id);
    const orders = await Promise.all([
      confirmedOrder(product.id, quantity),
      confirmedOrder(product.id, quantity),
    ]);
    await removeStock(product.id, warehouse.id, '1', lot.id);
    const results = await Promise.all(
      orders.map((order) =>
        http()
          .post(`/api/sales/orders/${order.id}/dispatch`)
          .send({
            items: [
              {
                saleOrderItemId: order.itemId,
                warehouseId: warehouse.id,
                lotId: lot.id,
                quantity,
              },
            ],
          }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const lotBalance = await kit.prisma.inventoryMovement.aggregate({
      where: { lotId: lot.id, warehouseId: warehouse.id },
      _sum: { quantity: true },
    });
    expect(lotBalance._sum.quantity?.toString()).toBe(remaining);
    const balance = await kit.prisma.stockBalance.findUniqueOrThrow({
      where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
    });
    expect(balance.quantity.toString()).toBe(remaining);
  });

  it('revierte todas las líneas si una línea posterior no tiene saldo', async () => {
    const first = await finishedProduct();
    const second = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await stock(first.id, warehouse.id, '2');
    await stock(second.id, warehouse.id, '2');
    const client = await customer();
    const created = await http()
      .post('/api/sales/orders')
      .send({
        customerId: client.id,
        items: [
          { productId: first.id, quantity: '2', unitPrice: '1' },
          { productId: second.id, quantity: '2', unitPrice: '1' },
        ],
      })
      .expect(201);
    const order = bodyData(created);
    await http().post(`/api/sales/orders/${order.id}/confirm`).send({}).expect(200);
    await removeStock(second.id, warehouse.id, '2');
    const before = await kit.prisma.stockBalance.findUniqueOrThrow({
      where: { productId_warehouseId: { productId: first.id, warehouseId: warehouse.id } },
    });
    await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [
          { saleOrderItemId: order.items[0].id, warehouseId: warehouse.id, quantity: '1' },
          { saleOrderItemId: order.items[1].id, warehouseId: warehouse.id, quantity: '1' },
        ],
      })
      .expect(409);
    expect(await kit.prisma.saleDispatch.count({ where: { saleOrderId: order.id } })).toBe(0);
    expect(
      await kit.prisma.inventoryMovement.count({
        where: { productId: first.id, type: InventoryMovementType.SALE_DISPATCH },
      }),
    ).toBe(0);
    expect(
      await kit.prisma.stockBalance.findUniqueOrThrow({
        where: { productId_warehouseId: { productId: first.id, warehouseId: warehouse.id } },
      }),
    ).toEqual(before);
    expect((await kit.prisma.saleOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      SaleOrderStatus.CONFIRMED,
    );
  });

  it('no permite cancelar una orden parcialmente despachada', async () => {
    const product = await finishedProduct();
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await stock(product.id, warehouse.id, '3');
    const order = await confirmedOrder(product.id, '3');
    await http()
      .post(`/api/sales/orders/${order.id}/dispatch`)
      .send({
        items: [{ saleOrderItemId: order.itemId, warehouseId: warehouse.id, quantity: '1' }],
      })
      .expect(200);
    await http().post(`/api/sales/orders/${order.id}/cancel`).send({}).expect(409);
    expect((await kit.prisma.saleOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      SaleOrderStatus.PARTIALLY_DISPATCHED,
    );
  });
});
