import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProductType, RoleCode, UnitOfMeasure } from '../src/generated/prisma/client.js';
import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';
import { createInventoryWarehouse } from './support/inventory-fixtures.js';

/**
 * C4: manufactura multinivel por etapas con el ejemplo EcoSoap.
 *
 *   OP 1: aceite usado recibido (lote de compra) → aceite filtrado (lote intermedio)
 *   OP 2: lote de aceite filtrado + soda + agua + esencia → jabón (lote en cuarentena)
 *
 * Cada nivel es una orden explícita; no hay explosión automática de la fórmula.
 */
let kit: TestApp;
let cookie: string;
const data = <T>(response: { body: unknown }) => (response.body as { data: T }).data;
const post = (path: string) => kit.http().post(path).set('Cookie', cookie);
const get = (path: string) => kit.http().get(path).set('Cookie', cookie);
const tag = randomUUID().slice(0, 6).toUpperCase();

type Product = { id: string; code: string };
type Order = {
  id: string;
  number: string;
  lot: { id: string; code: string; status: string } | null;
};
type Node = {
  product: Product & { type: string };
  bom: { id: string; activeVersion: { version: number; outputQuantity: string } | null } | null;
  route: { id: string; code: string; operationCount: number; totalStandardMinutes: string } | null;
  routeStatus: string;
  components: Array<{
    product: Product;
    quantity: string;
    unit: string;
    type: string;
    isManufactured: boolean;
    child: Node | null;
  }>;
  issues: Array<{ code: string }>;
  readiness: string;
};

const product = (
  code: string,
  name: string,
  type: ProductType,
  unit: UnitOfMeasure,
  flags: { isLotTracked?: boolean; requiresQualityInspection?: boolean } = {},
) =>
  kit.prisma.product.create({
    data: { code: `${code}-${tag}`, name, category: 'EcoSoap C4', type, unit, ...flags },
    select: { id: true, code: true },
  });

async function formula(output: Product, outputQuantity: string, items: [Product, string][]) {
  const bom = data<{ id: string }>(
    await post('/api/production/boms')
      .send({ productId: output.id, name: 'BOM ' + output.code })
      .expect(201),
  );
  const version = data<{ id: string; isActive: boolean }>(
    await post(`/api/production/boms/${bom.id}/versions`)
      .send({
        outputQuantity,
        items: items.map(([item, quantity]) => ({ productId: item.id, quantity })),
      })
      .expect(201),
  );
  expect(version.isActive).toBe(true);
  return { bomId: bom.id, versionId: version.id };
}

async function route(output: Product, operations: [number, string, string][]) {
  return data<{ id: string }>(
    await post('/api/production/routes')
      .send({
        productId: output.id,
        code: 'RT-' + output.code,
        name: 'Ruta ' + output.code,
        operations: operations.map(([sequence, name, standardMinutes]) => ({
          sequence,
          name,
          standardMinutes,
        })),
      })
      .expect(201),
  );
}

let warehouseId: string;
let rawOil: Product;
let filteredOil: Product;
let soap: Product;
let soda: Product;
let water: Product;
let essence: Product;
let filteredFormula: { bomId: string; versionId: string };
let soapFormula: { bomId: string; versionId: string };
let rawLotId: string;

beforeAll(async () => {
  kit = await createTestApp();
  cookie = await login(kit, await createUser(kit, RoleCode.ADMIN));
  warehouseId = (await createInventoryWarehouse(kit.prisma)).id;
  rawOil = await product(
    'MP-OIL-USED',
    'Aceite usado recibido',
    ProductType.RAW_MATERIAL,
    UnitOfMeasure.MILLILITER,
    { isLotTracked: true },
  );
  filteredOil = await product(
    'INT-OIL-FILTERED',
    'Aceite usado filtrado',
    ProductType.INTERMEDIATE,
    UnitOfMeasure.MILLILITER,
    { isLotTracked: true },
  );
  soap = await product(
    'PT-JABON-500',
    'Jabón ecológico 500 g',
    ProductType.FINISHED_GOOD,
    UnitOfMeasure.UNIT,
    { isLotTracked: true, requiresQualityInspection: true },
  );
  soda = await product('MP-NAOH', 'Soda cáustica', ProductType.RAW_MATERIAL, UnitOfMeasure.GRAM);
  water = await product('MP-AGUA', 'Agua', ProductType.RAW_MATERIAL, UnitOfMeasure.MILLILITER);
  essence = await product(
    'MP-ESENCIA',
    'Esencia',
    ProductType.RAW_MATERIAL,
    UnitOfMeasure.MILLILITER,
  );

  filteredFormula = await formula(filteredOil, '1000', [[rawOil, '1000']]);
  soapFormula = await formula(soap, '1', [
    [filteredOil, '500'],
    [soda, '70'],
    [water, '180'],
    [essence, '5'],
  ]);
  await route(filteredOil, [
    [10, 'Filtración', '30'],
    [20, 'Verificación visual', '5'],
  ]);
  await route(soap, [
    [10, 'Mezclado', '15'],
    [20, 'Moldeado', '10'],
    [30, 'Curado / secado', '21600'],
    [40, 'Inspección final', '5'],
    [50, 'Empaque', '5'],
  ]);

  // Aceite usado recibido llega por compra real y queda en un lote trazable.
  const supplier = await kit.prisma.supplier.create({
    data: { code: 'C4-' + tag, name: 'Recolector de aceite C4' },
  });
  const purchase = data<{ id: string; items: Array<{ id: string }> }>(
    await post('/api/purchase-orders')
      .send({
        supplierId: supplier.id,
        items: [{ productId: rawOil.id, quantity: '1000', unitPrice: '0.01' }],
      })
      .expect(201),
  );
  await post(`/api/purchase-orders/${purchase.id}/confirm`).send({}).expect(200);
  await post(`/api/purchase-orders/${purchase.id}/receive`)
    .send({
      items: [{ purchaseOrderItemId: purchase.items[0].id, warehouseId, quantity: '1000' }],
    })
    .expect(201);
  rawLotId = (await kit.prisma.lot.findFirstOrThrow({ where: { productId: rawOil.id } })).id;
  for (const [item, quantity] of [
    [soda, '70'],
    [water, '180'],
    [essence, '5'],
  ] as const)
    await post('/api/inventory/adjustments')
      .send({
        productId: item.id,
        warehouseId,
        type: 'ADJUSTMENT_IN',
        quantity,
        reason: 'INITIAL_LOAD',
      })
      .expect(201);
}, 60000);
afterAll(async () => {
  if (kit) await kit.close();
});

describe('C4: estructura de manufactura multinivel', () => {
  it('expone PT-JABON → aceite filtrado → aceite recibido con fórmulas, rutas y READY', async () => {
    const audits = await kit.prisma.auditLog.count();
    const root = data<Node & { maxDepth: number }>(
      await get(`/api/production/manufacturing-structure/${soap.id}`).expect(200),
    );
    expect(root.product).toMatchObject({ code: soap.code, type: 'FINISHED_GOOD' });
    expect(root.maxDepth).toBe(2);
    expect(root.readiness).toBe('READY');
    expect(root.issues).toEqual([]);
    expect(root.bom).toMatchObject({
      id: soapFormula.bomId,
      activeVersion: { version: 1, outputQuantity: '1.0000' },
    });
    expect(root.route).toMatchObject({ operationCount: 5, totalStandardMinutes: '21635.00' });
    expect(root.components).toHaveLength(4);
    const byCode = new Map(root.components.map((component) => [component.product.code, component]));
    const intermediate = byCode.get(filteredOil.code)!;
    expect(intermediate).toMatchObject({
      quantity: '500.0000',
      unit: 'MILLILITER',
      type: 'INTERMEDIATE',
      isManufactured: true,
    });
    expect(intermediate.child).toMatchObject({
      readiness: 'READY',
      routeStatus: 'ACTIVE',
      bom: { id: filteredFormula.bomId, activeVersion: { outputQuantity: '1000.0000' } },
      route: { operationCount: 2, totalStandardMinutes: '35.00' },
    });
    expect(
      intermediate.child!.components.map((c) => [
        c.product.code,
        c.quantity,
        c.isManufactured,
        c.child,
      ]),
    ).toEqual([[rawOil.code, '1000.0000', false, null]]);
    for (const leaf of [soda, water, essence])
      expect(byCode.get(leaf.code)).toMatchObject({ isManufactured: false, child: null });
    expect(byCode.get(soda.code)!.quantity).toBe('70.0000');
    // Lectura pura: no audita ni modifica nada.
    expect(await kit.prisma.auditLog.count()).toBe(audits);
  });

  it('404 para producto inexistente y 422 para raíz de materia prima', async () => {
    await get(`/api/production/manufacturing-structure/${randomUUID()}`).expect(404);
    const response = await get(`/api/production/manufacturing-structure/${rawOil.id}`).expect(422);
    expect(response.body).toMatchObject({ code: 'INVALID_MANUFACTURING_STRUCTURE_ROOT' });
    await kit.http().get(`/api/production/manufacturing-structure/${soap.id}`).expect(401);
  });
});

describe('C4: manufactura por etapas con lote intermedio', () => {
  let filteredOrder: Order;
  let filteredLotId: string;
  let soapOrder: Order;

  it('OP 1 fabrica el intermedio y genera su lote liberado', async () => {
    filteredOrder = data<Order>(
      await post('/api/production/orders')
        .send({
          productId: filteredOil.id,
          bomVersionId: filteredFormula.versionId,
          warehouseId,
          quantityPlanned: '1000',
        })
        .expect(201),
    );
    await post(`/api/production/orders/${filteredOrder.id}/start`).send({}).expect(200);
    const completed = data<Order>(
      await post(`/api/production/orders/${filteredOrder.id}/complete`)
        .send({
          quantityProduced: '1000',
          allocations: [{ productId: rawOil.id, lots: [{ lotId: rawLotId, quantity: '1000' }] }],
        })
        .expect(200),
    );
    expect(completed.lot).toMatchObject({ status: 'RELEASED' });
    filteredLotId = completed.lot!.id;
    const movements = await kit.prisma.inventoryMovement.findMany({
      where: { productionOrderId: filteredOrder.id },
      orderBy: { id: 'asc' },
    });
    expect(movements.map((m) => [m.type, m.productId, m.lotId, m.quantity.toFixed(4)])).toEqual([
      ['PRODUCTION_CONSUMPTION', rawOil.id, rawLotId, '-1000.0000'],
      ['PRODUCTION_OUTPUT', filteredOil.id, filteredLotId, '1000.0000'],
    ]);
    const lot = await kit.prisma.lot.findUniqueOrThrow({ where: { id: filteredLotId } });
    expect(lot).toMatchObject({ productId: filteredOil.id, productionOrderId: filteredOrder.id });
  });

  it('OP 2: requirements solo devuelve los componentes directos de la fórmula', async () => {
    soapOrder = data<Order>(
      await post('/api/production/orders')
        .send({
          productId: soap.id,
          bomVersionId: soapFormula.versionId,
          warehouseId,
          quantityPlanned: '1',
        })
        .expect(201),
    );
    const requirements = data<{
      canStart: boolean;
      items: Array<{ product: Product; required: string; shortage: string }>;
    }>(await get(`/api/production/orders/${soapOrder.id}/requirements`).expect(200));
    expect(requirements.items.map((item) => [item.product.code, item.required]).sort()).toEqual(
      [
        [filteredOil.code, '500.0000'],
        [soda.code, '70.0000'],
        [water.code, '180.0000'],
        [essence.code, '5.0000'],
      ].sort(),
    );
    // Sin explosión: el aceite recibido pertenece a la OP del intermedio, no a esta.
    expect(requirements.items.some((item) => item.product.id === rawOil.id)).toBe(false);
    expect(requirements.canStart).toBe(true);
  });

  it('OP 2 consume explícitamente el lote intermedio y genera el lote final en cuarentena', async () => {
    await post(`/api/production/orders/${soapOrder.id}/start`).send({}).expect(200);
    const completed = data<Order>(
      await post(`/api/production/orders/${soapOrder.id}/complete`)
        .send({
          quantityProduced: '1',
          allocations: [
            { productId: filteredOil.id, lots: [{ lotId: filteredLotId, quantity: '500' }] },
          ],
        })
        .expect(200),
    );
    expect(completed.lot).toMatchObject({ status: 'QUARANTINED' });
    const consumption = await kit.prisma.inventoryMovement.findMany({
      where: { productionOrderId: soapOrder.id, type: 'PRODUCTION_CONSUMPTION' },
    });
    expect(consumption).toHaveLength(4);
    expect(consumption.some((m) => m.productId === rawOil.id)).toBe(false);
    const intermediate = consumption.find((m) => m.productId === filteredOil.id)!;
    expect(intermediate).toMatchObject({ lotId: filteredLotId });
    expect(intermediate.quantity.toFixed(4)).toBe('-500.0000');
    // El lote intermedio conserva el saldo no consumido.
    const ledger = await kit.prisma.inventoryMovement.aggregate({
      where: { lotId: filteredLotId },
      _sum: { quantity: true },
    });
    expect(ledger._sum.quantity!.toFixed(4)).toBe('500.0000');
    const output = await kit.prisma.inventoryMovement.findFirstOrThrow({
      where: { productionOrderId: soapOrder.id, type: 'PRODUCTION_OUTPUT' },
    });
    expect(output).toMatchObject({ productId: soap.id, lotId: completed.lot!.id });
  });

  it('la trazabilidad de lotes reconstruye jabón → lote filtrado → OP 1 → lote recibido', async () => {
    const soapLot = await kit.prisma.lot.findFirstOrThrow({
      where: { productionOrderId: soapOrder.id },
    });
    const trace = data<{
      rootLotId: string;
      lots: Array<{
        id: string;
        product: Product;
        consumptions: Array<{ lotId: string | null; product: Product; quantity: string }>;
        origin: { type: string; productionOrder?: { id: string } };
      }>;
    }>(await get(`/api/production/lots/${soapLot.id}/traceability`).expect(200));
    const byId = new Map(trace.lots.map((lot) => [lot.id, lot]));
    const root = byId.get(soapLot.id)!;
    expect(root.consumptions).toContainEqual(
      expect.objectContaining({ lotId: filteredLotId, quantity: '500.0000' }),
    );
    const filtered = byId.get(filteredLotId)!;
    expect(filtered.origin).toMatchObject({
      type: 'PRODUCTION_ORDER',
      productionOrder: { id: filteredOrder.id },
    });
    expect(filtered.consumptions).toEqual([
      expect.objectContaining({ lotId: rawLotId, quantity: '1000.0000' }),
    ]);
    expect(byId.get(rawLotId)!.origin.type).not.toBe('PRODUCTION_ORDER');
  });

  it('C3: la huella de la OP final toma el intermedio del ledger sin explotar su materia prima', async () => {
    const footprint = data<{
      activities: Array<{ inventoryMovementId: string | null }>;
      missingFactors: Array<{ productId: string; consumedQuantity: string }>;
    }>(
      await post(`/api/sustainability/production-orders/${soapOrder.id}/footprint`)
        .send({})
        .expect(201),
    );
    expect(footprint.missingFactors).toContainEqual(
      expect.objectContaining({ productId: filteredOil.id, consumedQuantity: '500.0000' }),
    );
    expect(footprint.missingFactors.some((item) => item.productId === rawOil.id)).toBe(false);
  });

  it('C2: el lote final en cuarentena sigue aprobándose con la inspección existente', async () => {
    const soapLot = await kit.prisma.lot.findFirstOrThrow({
      where: { productionOrderId: soapOrder.id },
    });
    await post(`/api/production/lots/${soapLot.id}/inspection`)
      .send({ result: 'APPROVED', observations: 'Lote C4 conforme' })
      .expect(201);
    expect((await kit.prisma.lot.findUniqueOrThrow({ where: { id: soapLot.id } })).status).toBe(
      'RELEASED',
    );
  });
});
