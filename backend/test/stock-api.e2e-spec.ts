import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InventoryService } from '../src/inventory/movements/inventory.service.js';
import { StockQueryService } from '../src/inventory/stock/stock-query.service.js';
import { LotStatus, ProductType, RoleCode } from '../src/generated/prisma/client.js';
import {
  createInventoryLot,
  createInventoryProduct,
  createInventoryWarehouse,
} from './support/inventory-fixtures.js';
import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';

type StockList = {
  data: {
    id: string;
    quantity: string;
    updatedAt: string;
    product: {
      id: string;
      code: string;
      name: string;
      type: ProductType;
      unit: string;
      isLotTracked: boolean;
    };
    warehouse: { id: string; code: string; name: string };
  }[];
  meta: { page: number; limit: number; total: number };
};

let kit: TestApp;
let actorId: string;
let cookie: string;
let inventory: InventoryService;

beforeAll(async () => {
  kit = await createTestApp();
  const actor = await createUser(kit, RoleCode.INVENTARIO);
  actorId = actor.id;
  cookie = await login(kit, actor);
  inventory = kit.app.get(InventoryService);
});

afterAll(async () => {
  if (kit) await kit.close();
});

async function moveStock(
  productId: string,
  warehouseId: string,
  quantity: string,
  lotId?: string,
  type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' = 'ADJUSTMENT_IN',
) {
  return kit.prisma.$transaction((tx) =>
    inventory.applyMovements(tx, {
      performedByUserId: actorId,
      lines: [
        {
          productId,
          warehouseId,
          lotId,
          type,
          quantity,
          origin: { kind: 'ADJUSTMENT', reason: 'INITIAL_LOAD' },
        },
      ],
    }),
  );
}

async function list(query: Record<string, string | number>, session = cookie): Promise<StockList> {
  const response = await kit
    .http()
    .get('/api/inventory/stock')
    .set('Cookie', session)
    .query(query)
    .expect(200);
  return response.body as StockList;
}

describe('GET /api/inventory/stock: existencias físicas', () => {
  it('combina filtros y conserva el total en una página vacía', async () => {
    const product = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const otherWarehouse = await createInventoryWarehouse(kit.prisma);
    const otherProduct = await createInventoryProduct(kit.prisma);
    await moveStock(product.id, warehouse.id, '12.5');
    await moveStock(product.id, otherWarehouse.id, '2');
    await moveStock(otherProduct.id, warehouse.id, '3');
    const filters = {
      productId: product.id,
      warehouseId: warehouse.id,
      productType: ProductType.RAW_MATERIAL,
      search: product.code.toLowerCase(),
      hasStock: 'true',
      limit: 1,
    };
    const response = await list({ ...filters, page: 1 });
    expect(response.meta).toEqual({ page: 1, limit: 1, total: 1 });
    expect(response.data).toHaveLength(1);
    expect(typeof response.data[0].id).toBe('string');
    expect(Number.isNaN(Date.parse(response.data[0].updatedAt))).toBe(false);
    expect(response.data[0]).toMatchObject({
      quantity: '12.5000',
      product: {
        id: product.id,
        code: product.code,
        name: product.name,
        type: product.type,
        unit: product.unit,
        isLotTracked: false,
      },
      warehouse: { id: warehouse.id, code: warehouse.code, name: warehouse.name },
    });
    const emptyPage = await list({ ...filters, page: 2 });
    expect(emptyPage).toEqual({ data: [], meta: { page: 2, limit: 1, total: 1 } });
    expect((await list({ ...filters, productType: ProductType.FINISHED_GOOD })).meta.total).toBe(0);
  });

  it('incluye todos los estados de lote sin cambiar la disponibilidad consumible', async () => {
    const product = await createInventoryProduct(kit.prisma, { isLotTracked: true });
    const warehouse = await createInventoryWarehouse(kit.prisma);
    for (const [status, quantity] of [
      [LotStatus.RELEASED, '8'],
      [LotStatus.QUARANTINED, '5'],
      [LotStatus.REJECTED, '3'],
    ] as const) {
      const lot = await createInventoryLot(kit.prisma, product.id, status);
      await moveStock(product.id, warehouse.id, quantity, lot.id);
    }
    const response = await list({
      productId: product.id,
      warehouseId: warehouse.id,
      hasStock: 'true',
    });
    expect(response.meta.total).toBe(1);
    expect(response.data[0]).toMatchObject({
      quantity: '16.0000',
      product: { isLotTracked: true },
    });
    const queries = kit.app.get(StockQueryService);
    expect((await queries.getConsumableQuantity(product.id, warehouse.id)).toFixed(4)).toBe(
      '8.0000',
    );
  });

  it.each([LotStatus.QUARANTINED, LotStatus.REJECTED])(
    'hasStock=true incluye existencia exclusivamente en lotes %s',
    async (status) => {
      const product = await createInventoryProduct(kit.prisma, { isLotTracked: true });
      const warehouse = await createInventoryWarehouse(kit.prisma);
      const lot = await createInventoryLot(kit.prisma, product.id, status);
      await moveStock(product.id, warehouse.id, '5', lot.id);
      const response = await list({ productId: product.id, hasStock: 'true' });
      expect(response.meta.total).toBe(1);
      expect(response.data[0].quantity).toBe('5.0000');
    },
  );

  it('hasStock=true excluye saldos cero; false u omitido incluye todos los saldos existentes', async () => {
    const product = await createInventoryProduct(kit.prisma);
    const positive = await createInventoryWarehouse(kit.prisma);
    const zero = await createInventoryWarehouse(kit.prisma);
    await moveStock(product.id, positive.id, '4');
    await moveStock(product.id, zero.id, '1');
    await moveStock(product.id, zero.id, '1', undefined, 'ADJUSTMENT_OUT');
    const filtered = await list({ productId: product.id, hasStock: 'true' });
    expect(filtered.meta.total).toBe(1);
    expect(filtered.data[0]).toMatchObject({ warehouse: { id: positive.id }, quantity: '4.0000' });
    const cases: Record<string, string | number>[] = [
      { productId: product.id },
      { productId: product.id, hasStock: 'false' },
    ];
    for (const filters of cases) {
      const response = await list(filters);
      expect(response.meta.total).toBe(2);
      expect(response.data.map((row) => row.quantity).sort()).toEqual(['0.0000', '4.0000']);
    }
  });

  it('no inventa saldos para productos sin movimientos y acepta filtros sin coincidencias', async () => {
    const product = await createInventoryProduct(kit.prisma);
    for (const productId of [product.id, randomUUID()]) {
      expect(await list({ productId })).toEqual({
        data: [],
        meta: { page: 1, limit: 20, total: 0 },
      });
    }
  });

  it('busca coincidencias parciales por código y nombre sin distinguir mayúsculas', async () => {
    const product = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await moveStock(product.id, warehouse.id, '1');
    for (const search of [product.code.slice(4).toLowerCase(), product.name.toUpperCase()]) {
      const response = await list({ warehouseId: warehouse.id, search });
      expect(response.meta.total).toBe(1);
      expect(response.data[0].product.id).toBe(product.id);
    }
    expect((await list({ warehouseId: warehouse.id, search: 'SIN-COINCIDENCIA' })).meta.total).toBe(
      0,
    );
  });

  it('pagina sin repetir filas cuando los nombres coinciden', async () => {
    const warehouse = await createInventoryWarehouse(kit.prisma);
    const products = [];
    for (let index = 0; index < 3; index += 1) {
      const product = await createInventoryProduct(kit.prisma);
      await kit.prisma.product.update({
        where: { id: product.id },
        data: { name: 'Mismo nombre' },
      });
      await moveStock(product.id, warehouse.id, '1');
      products.push(product.id);
    }
    const ids = [];
    for (let page = 1; page <= 3; page += 1) {
      const response = await list({ warehouseId: warehouse.id, page, limit: 1 });
      expect(response.meta).toEqual({ page, limit: 1, total: 3 });
      expect(response.data).toHaveLength(1);
      ids.push(response.data[0].product.id);
    }
    expect(ids).toEqual(products.sort());
  });

  it('devuelve cantidades decimales exactas con cuatro posiciones', async () => {
    const product = await createInventoryProduct(kit.prisma);
    const warehouse = await createInventoryWarehouse(kit.prisma);
    await moveStock(product.id, warehouse.id, '0.1');
    await moveStock(product.id, warehouse.id, '0.2');
    const response = await list({ productId: product.id });
    expect(response.data[0].quantity).toBe('0.3000');
  });

  it.each(Object.values(RoleCode))('%s puede consultar existencias', async (role) => {
    const user = await createUser(kit, role);
    const session = await login(kit, user);
    const response = await list({ productId: randomUUID() }, session);
    expect(response.meta.total).toBe(0);
  });

  it('exige sesión', async () => {
    await kit.http().get('/api/inventory/stock').expect(401);
  });

  it.each([
    { productId: 'no-es-uuid' },
    { warehouseId: 'no-es-uuid' },
    { productType: 'DESCONOCIDO' },
    { hasStock: 'tal-vez' },
    { hasStock: '0' },
    { search: '' },
    { search: '   ' },
    { search: 'x'.repeat(101) },
    { page: 0 },
    { limit: 101 },
    { extra: 'campo' },
  ])('rechaza filtros inválidos: %j', async (query) => {
    await kit.http().get('/api/inventory/stock').set('Cookie', cookie).query(query).expect(400);
  });
});
