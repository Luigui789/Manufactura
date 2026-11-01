import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatChecks, verifyDemoDataset } from '../src/demo/demo-checks.js';
import { DEMO_USERS, DEMO_WAREHOUSE_CODE, P } from '../src/demo/demo-data.js';
import { Prisma, type RoleCode } from '../src/generated/prisma/client.js';
import type { OrdersService } from '../src/production/orders/orders.service.js';
import type { TraceabilityService } from '../src/production/quality/traceability.service.js';
import type { FootprintsService } from '../src/sustainability/footprints/footprints.service.js';
import type { MonitoringService } from '../src/iiot/monitoring/monitoring.service.js';
import type { DashboardService } from '../src/production/dashboard/dashboard.service.js';
import type { DashboardService as InventoryDashboardService } from '../src/inventory/dashboard/dashboard.service.js';
import type { DashboardService as PurchasesDashboardService } from '../src/purchases/dashboard/dashboard.service.js';
import type { DashboardService as SalesDashboardService } from '../src/sales/dashboard/dashboard.service.js';
import type { DashboardService as QualityDashboardService } from '../src/production/quality/dashboard/dashboard.service.js';
import { createTestApp, login, type TestApp } from './support/auth-test-kit.js';
import { waitForCondition } from './support/wait-for-condition.js';

type Order = Awaited<ReturnType<OrdersService['get']>>;
type Footprint = NonNullable<Awaited<ReturnType<FootprintsService['get']>>>;
type Trace = Awaited<ReturnType<TraceabilityService['get']>>;
type Overview = Awaited<ReturnType<MonitoringService['overview']>>;
type Dashboard = Awaited<ReturnType<DashboardService['get']>>;
type Document = { id: string; status: string; items: { id: string }[] };
let kit: TestApp;
let warehouseId: string;
const cookies = {} as Record<RoleCode, string>;
const products = new Map<string, string>();
const productId = (code: string) => {
  const id = products.get(code);
  if (!id) throw new Error(`Missing official product ${code}`);
  return id;
};
const data = <T>(response: { body: unknown }) => (response.body as { data: T }).data;
const get = (path: string, role: RoleCode = 'PRODUCCION') =>
  kit.http().get(`/api/${path}`).set('Cookie', cookies[role]);
const post = (path: string, role: RoleCode = 'PRODUCCION') =>
  kit.http().post(`/api/${path}`).set('Cookie', cookies[role]);
const opPath = (id: string) => `production/orders/${id}`;
const footprintPath = (id: string) => `sustainability/production-orders/${id}/footprint`;
const iiotPath = (id: string) => `iiot/production-orders/${id}`;
const decimal = (value: string) => new Prisma.Decimal(value);

beforeAll(async () => {
  if (!process.env.DEMO_USER_PASSWORD)
    throw new Error('Seed first; DEMO_USER_PASSWORD is required');
  kit = await createTestApp(); // *_test guard, real AppModule, no domain or MQTT mocks.
  const checks = await verifyDemoDataset(kit.prisma);
  expect(formatChecks(checks).ready, formatChecks(checks).text).toBe(true);
  for (const user of DEMO_USERS)
    cookies[user.role] = await login(kit, { ...user, password: process.env.DEMO_USER_PASSWORD });
  for (const product of await kit.prisma.product.findMany({
    where: { code: { in: Object.values(P) } },
  }))
    products.set(product.code, product.id);
  warehouseId = (
    await kit.prisma.warehouse.findUniqueOrThrow({
      where: { code: DEMO_WAREHOUSE_CODE },
    })
  ).id;
});
afterAll(async () => {
  if (kit) await kit.close();
});

async function stock(code: string, expected: string) {
  const balance = await kit.prisma.stockBalance.findUniqueOrThrow({
    where: { productId_warehouseId: { productId: productId(code), warehouseId } },
  });
  expect(balance.quantity.eq(expected), `${code} stock`).toBe(true);
  // INVENTARIO reads the real stock contract as well as the ledger assertions below.
  const response = await get(
    `inventory/stock?productId=${productId(code)}&warehouseId=${warehouseId}`,
    'INVENTARIO',
  ).expect(200);
  expect(Array.isArray(data(response))).toBe(true);
  const rows = data<{ product: { id: string }; quantity: string }[]>(response);
  expect(rows).toHaveLength(1);
  expect(rows[0].product.id).toBe(productId(code));
  expect(decimal(rows[0].quantity).eq(expected)).toBe(true);
}

async function order(code: string, quantity: string) {
  const version = await kit.prisma.bomVersion.findFirstOrThrow({
    where: { isActive: true, version: 1, bom: { productId: productId(code) } },
  });
  return data<Order>(
    await post('production/orders')
      .send({
        productId: productId(code),
        warehouseId,
        bomVersionId: version.id,
        quantityPlanned: quantity,
      })
      .expect(201),
  );
}
async function requirements(id: string, expected: Record<string, string>) {
  const result = data<Awaited<ReturnType<OrdersService['requirements']>>>(
    await get(`${opPath(id)}/requirements`).expect(200),
  );
  expect(result.version).toBe(1);
  expect(result.canStart).toBe(true);
  expect(
    Object.fromEntries(
      result.items.map((item) => [item.product.code, decimal(item.required).toString()]),
    ),
  ).toEqual(expected);
}
async function start(id: string) {
  expect(data<Order>(await post(`${opPath(id)}/start`).expect(200)).status).toBe('IN_PROGRESS');
}
async function complete(
  id: string,
  quantity: string,
  code: string,
  lotId: string,
  consumed: string,
) {
  const result = data<Order>(
    await post(`${opPath(id)}/complete`)
      .send({
        quantityProduced: quantity,
        allocations: [{ productId: productId(code), lots: [{ lotId, quantity: consumed }] }],
      })
      .expect(200),
  );
  expect(result.status).toBe('COMPLETED');
  expect(result.lot).toBeTruthy();
  return result.lot!;
}
async function movements(id: string, expected: Record<string, string>) {
  const rows = await kit.prisma.inventoryMovement.findMany({
    where: { productionOrderId: id },
    include: { product: true },
  });
  expect(
    Object.fromEntries(rows.map((row) => [row.product.code, row.quantity.toString()])),
  ).toEqual(expected);
  expect(rows).toHaveLength(Object.keys(expected).length);
  for (const row of rows)
    expect(row.type).toBe(
      row.quantity.isNegative() ? 'PRODUCTION_CONSUMPTION' : 'PRODUCTION_OUTPUT',
    );
}
async function inspect(lotId: string, result: 'APPROVED' | 'REJECTED' = 'APPROVED') {
  const inspection = data<{ id: string; result: string }>(
    await post(`production/lots/${lotId}/inspection`)
      .send({
        result,
        observations: 'Defensa integrada EcoSoap',
        ...(result === 'REJECTED'
          ? { nonConformities: 'Muestra académica fuera de especificación' }
          : {}),
      })
      .expect(201),
  );
  expect(inspection.result).toBe(result);
  expect((await kit.prisma.lot.findUniqueOrThrow({ where: { id: lotId } })).status).toBe(
    result === 'APPROVED' ? 'RELEASED' : 'REJECTED',
  );
  return inspection.id;
}

async function simulate(id: string, process: 'bar' | 'liquid', scenario: 'normal' | 'deviation') {
  await post(`${iiotPath(id)}/simulation`)
    .send({ process, scenario })
    .expect(202);
  const diagnostics = async () => ({
    productionOrderId: id,
    simulation: data(await get(`${iiotPath(id)}/simulation`).expect(200)),
    readingCount: await kit.prisma.iiotReading.count({ where: { productionOrderId: id } }),
    alertCount: await kit.prisma.iiotAlert.count({ where: { productionOrderId: id } }),
  });
  await waitForCondition(
    async () => data<unknown[]>(await get(`${iiotPath(id)}/readings`).expect(200)).length > 0,
    diagnostics,
  );
  const overview = data<Overview>(await get(`${iiotPath(id)}/overview`).expect(200));
  expect(overview.productionOrder).toMatchObject({ id, status: 'IN_PROGRESS' });
  expect(overview.telemetry.latestByMetric.length).toBeGreaterThan(0);
  for (const reading of overview.telemetry.latestByMetric) {
    expect(reading.productionOrderId).toBe(id);
    expect(reading.device.id).toBeTruthy();
  }
  const readings = data<{ productionOrderId: string }[]>(
    await get(`${iiotPath(id)}/readings`).expect(200),
  );
  expect(readings.every((reading) => reading.productionOrderId === id)).toBe(true);
  expect(Array.isArray(data(await get(`${iiotPath(id)}/alerts`).expect(200)))).toBe(true);
  if (scenario === 'deviation') {
    // Real fixed 60-sample profile begins deviation after 55% (~33 s).
    // Keep 300 ms polling; allow the real profile to reach an alarm without changing it.
    await waitForCondition(
      async () => {
        const alerts = data<{ severity: string }[]>(
          await get(`${iiotPath(id)}/alerts`).expect(200),
        );
        return alerts.some((alert) => ['WARNING', 'CRITICAL'].includes(alert.severity));
      },
      diagnostics,
      75_000,
    );
  }
}

async function footprint(id: string, expected: string[]) {
  const result = data<Footprint>(await post(footprintPath(id)).expect(201));
  expect(result.status).toBe('DRAFT');
  expect(result.missingFactors).toEqual([]);
  expect(
    result.activities.map((activity) => activity.inventoryMovement?.product.code).sort(),
  ).toEqual([...expected].sort());
  for (const activity of result.activities) {
    const factor = await kit.prisma.emissionFactor.findUniqueOrThrow({
      where: { id: activity.emissionFactorId },
    });
    expect(activity.factorCodeSnapshot).toBe(factor.code);
    expect(decimal(activity.factorValueSnapshot).eq(factor.kgCo2ePerUnit)).toBe(true);
    expect(activity.factorSourceNameSnapshot).toBe(factor.sourceName);
    expect(activity.factorSourceReferenceSnapshot).toBe(factor.sourceReference);
    expect(activity.factorSourceYearSnapshot).toBe(factor.sourceYear);
  }
  return result;
}

describe('C6 — defensa integrada EcoSoap (dataset oficial limpio, MQTT y simulador reales)', () => {
  it('proveedor → recepción → filtrado → barra → IIoT → calidad → carbono → venta → dashboards; líquido y regresiones', async () => {
    // 1. COMPRAS compra y recibe aceite trazable; no se usan precios como evidencia financiera.
    const supplier = await kit.prisma.supplier.findUniqueOrThrow({
      where: { code: 'SUP-ACU-001' },
    });
    const purchase = data<Document>(
      await post('purchase-orders', 'COMPRAS')
        .send({
          supplierId: supplier.id,
          items: [{ productId: productId(P.ACU), quantity: '10000', unitPrice: '1' }],
        })
        .expect(201),
    );
    expect(
      data<Document>(await post(`purchase-orders/${purchase.id}/confirm`, 'COMPRAS').expect(200))
        .status,
    ).toBe('CONFIRMED');
    await post(`purchase-orders/${purchase.id}/receive`, 'COMPRAS')
      .send({
        items: [{ purchaseOrderItemId: purchase.items[0].id, warehouseId, quantity: '10000' }],
      })
      .expect(201);
    const rawLot = await kit.prisma.lot.findFirstOrThrow({
      where: { purchaseReceiptItem: { receipt: { purchaseOrderId: purchase.id } } },
      include: {
        purchaseReceiptItem: { include: { receipt: { include: { purchaseOrder: true } } } },
      },
    });
    const rawOilLotId = rawLot.id;
    const receipt = rawLot.purchaseReceiptItem!.receipt;
    expect(rawLot.productId).toBe(productId(P.ACU));
    expect(receipt.purchaseOrder.supplierId).toBe(supplier.id);
    expect(receipt.purchaseOrder.status).toBe('RECEIVED');
    expect(rawLot.purchaseReceiptItem!.quantity.eq('10000')).toBe(true);
    expect(
      await kit.prisma.inventoryMovement.findUnique({
        where: { purchaseReceiptItemId: rawLot.purchaseReceiptItemId! },
      }),
    ).toMatchObject({ type: 'PURCHASE_RECEIPT', lotId: rawOilLotId });
    await stock(P.ACU, '10000');

    // 2. PRODUCCION transforma explícitamente el primer nivel (direct-only).
    const filtered = await order(P.ACU_FIL, '5000');
    await requirements(filtered.id, { [P.ACU]: '5000' });
    await start(filtered.id);
    const filteredLot = await complete(filtered.id, '5000', P.ACU, rawOilLotId, '5000');
    const filteredOilLotId = filteredLot.id;
    expect(filteredLot.status).toBe('RELEASED');
    await movements(filtered.id, { [P.ACU]: '-5000', [P.ACU_FIL]: '5000' });
    expect(
      await kit.prisma.inventoryMovement.findFirst({
        where: { productionOrderId: filtered.id, type: 'PRODUCTION_CONSUMPTION' },
      }),
    ).toMatchObject({ lotId: rawOilLotId });
    await stock(P.ACU, '5000');
    await stock(P.ACU_FIL, '5000');
    const trace = data<Trace>(
      await get(`production/lots/${filteredOilLotId}/traceability`).expect(200),
    );
    const tracedFilter = trace.lots.find((lot) => lot.id === filteredOilLotId);
    expect(tracedFilter).toMatchObject({ origin: { productionOrder: { id: filtered.id } } });
    expect(tracedFilter?.consumptions.some((item) => item.lotId === rawOilLotId)).toBe(true);
    expect(trace.lots.find((lot) => lot.id === rawOilLotId)).toMatchObject({
      origin: {
        purchaseReceipt: { id: receipt.id },
        purchaseOrder: { id: purchase.id },
        supplier: { id: supplier.id },
      },
    });

    // 3. Barra 10 UNIT: fórmula directa, proceso bar y lote en cuarentena.
    const bar = await order(P.BAR, '10');
    await requirements(bar.id, {
      [P.ACU_FIL]: '5000',
      [P.NAOH]: '700',
      [P.WATER]: '1800',
      [P.ESSENCE]: '50',
    });
    await start(bar.id);
    await simulate(bar.id, 'bar', 'normal');
    // Separate draft/start uses no stock; no fixtures or fabricated telemetry for deviation.
    const deviation = await order(P.BAR, '1');
    await start(deviation.id);
    await simulate(deviation.id, 'bar', 'deviation');
    // Confirmation requires RELEASED stock. Manufacture a real 1-UNIT control lot
    // so the negative dispatch reaches the lot policy on a CONFIRMED sale.
    const controlFilter = await order(P.ACU_FIL, '500');
    await start(controlFilter.id);
    const controlOil = await complete(controlFilter.id, '500', P.ACU, rawOilLotId, '500');
    const controlLot = await complete(deviation.id, '1', P.ACU_FIL, controlOil.id, '500');
    await inspect(controlLot.id);
    const soapLot = await complete(bar.id, '10', P.ACU_FIL, filteredOilLotId, '5000');
    const soapLotId = soapLot.id;
    expect(soapLot.status).toBe('QUARANTINED');
    await movements(bar.id, {
      [P.ACU_FIL]: '-5000',
      [P.NAOH]: '-700',
      [P.WATER]: '-1800',
      [P.ESSENCE]: '-50',
      [P.BAR]: '10',
    });
    expect(
      await kit.prisma.inventoryMovement.findFirst({
        where: {
          productionOrderId: bar.id,
          productId: productId(P.ACU_FIL),
          type: 'PRODUCTION_CONSUMPTION',
        },
      }),
    ).toMatchObject({ lotId: filteredOilLotId });

    // 4. VENTAS prepara orden real: cuarentena bloquea despacho sin efectos parciales.
    const customer = await kit.prisma.customer.findUniqueOrThrow({
      where: { code: 'CLI-VERDE-001' },
    });
    const sale = data<Document>(
      await post('sales/orders', 'VENTAS')
        .send({
          customerId: customer.id,
          items: [{ productId: productId(P.BAR), quantity: '5', unitPrice: '1' }],
        })
        .expect(201),
    );
    await post(`sales/orders/${sale.id}/confirm`, 'VENTAS').expect(409);
    const dispatchPayload = {
      items: [{ saleOrderItemId: sale.items[0].id, warehouseId, lotId: soapLotId, quantity: '5' }],
    };
    const controlSale = data<Document>(
      await post('sales/orders', 'VENTAS')
        .send({
          customerId: customer.id,
          items: [{ productId: productId(P.BAR), quantity: '1', unitPrice: '1' }],
        })
        .expect(201),
    );
    await post(`sales/orders/${controlSale.id}/confirm`, 'VENTAS').expect(200);
    const controlDispatch = {
      items: [
        { saleOrderItemId: controlSale.items[0].id, warehouseId, lotId: soapLotId, quantity: '1' },
      ],
    };
    const blocked = await post(`sales/orders/${controlSale.id}/dispatch`, 'VENTAS')
      .send(controlDispatch)
      .expect(409);
    expect((blocked.body as { message: string }).message).toBe(
      'Solo se pueden despachar lotes liberados',
    );
    expect(await kit.prisma.saleDispatch.count({ where: { saleOrderId: controlSale.id } })).toBe(0);
    await stock(P.BAR, '11');
    // Sell only the released control unit; the main lot remains untouched at 10.
    await post(`sales/orders/${controlSale.id}/dispatch`, 'VENTAS')
      .send({
        items: [{ ...controlDispatch.items[0], lotId: controlLot.id }],
      })
      .expect(200);
    await stock(P.BAR, '10');
    const inspectionId = await inspect(soapLotId);
    await stock(P.BAR, '10');
    await post(`sales/orders/${sale.id}/confirm`, 'VENTAS').expect(200);

    // 5. Sostenibilidad: snapshots del consumo real, circularidad separada y energía manual.
    const carbon = await footprint(bar.id, [P.ACU_FIL, P.NAOH, P.WATER, P.ESSENCE]);
    expect(carbon.activities.map((a) => a.factorCodeSnapshot).sort()).toEqual(
      ['DEMO-ACU-FIL', 'DEMO-NAOH', 'DEMO-WATER', 'DEMO-ESSENCE'].sort(),
    );
    expect(carbon.circularity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricCode: 'USED_COOKING_OIL_RECOVERED',
          quantity: '5.00000000',
          reportingUnit: 'LITER',
        }),
      ]),
    );
    const energy = await kit.prisma.emissionFactor.findUniqueOrThrow({
      where: { code: 'DEMO-ELECTRICITY' },
    });
    const manual = {
      emissionFactorId: energy.id,
      quantity: '5',
      description: 'Energía manual 5 kWh; supuesto académico',
    };
    const preview = data<Footprint>(
      await post(`${footprintPath(bar.id)}/activities`)
        .send(manual)
        .expect(201),
    );
    expect(preview.missingFactors).toEqual([]);
    expect(preview.activities.find((activity) => activity.source === 'MANUAL')).toMatchObject({
      factorCodeSnapshot: 'DEMO-ELECTRICITY',
      activityQuantity: '5.00000000',
      activityUnit: 'KWH',
    });
    expect(decimal(preview.totalKgCo2ePreview).gt(0)).toBe(true);
    expect(decimal(preview.kgCo2ePerOutputUnitPreview).gt(0)).toBe(true);
    const sum = preview.activities.reduce(
      (total, activity) => total.plus(activity.emissionsKgCo2e),
      decimal('0'),
    );
    expect(sum.eq(preview.totalKgCo2ePreview)).toBe(true); // Never subtract circularity.
    expect(sum.div(10).toFixed(8)).toBe(preview.kgCo2ePerOutputUnitPreview);
    const finalized = data<Footprint>(
      await post(`${footprintPath(bar.id)}/finalize`)
        .send({
          boundaryNotes:
            'Estimación académica parcial cradle-to-gate para el escenario integrado EcoSoap.',
        })
        .expect(200),
    );
    expect(finalized.status).toBe('FINALIZED');
    expect(finalized.totalKgCo2e).toBe(preview.totalKgCo2ePreview);
    await post(`${footprintPath(bar.id)}/activities`)
      .send(manual)
      .expect(409);

    // 6. Despacho real y saldo de lote calculado desde el ledger (no existe lot balance).
    const dispatch = data<{ id: string }>(
      await post(`sales/orders/${sale.id}/dispatch`, 'VENTAS').send(dispatchPayload).expect(200),
    );
    expect(await kit.prisma.saleDispatch.findUnique({ where: { id: dispatch.id } })).toMatchObject({
      saleOrderId: sale.id,
    });
    const outbound = await kit.prisma.inventoryMovement.findFirstOrThrow({
      where: { lotId: soapLotId, type: 'SALE_DISPATCH' },
    });
    expect(outbound.quantity.eq('-5')).toBe(true);
    expect(outbound.saleDispatchItemId).toBeTruthy();
    await stock(P.BAR, '5');
    expect(
      (
        await kit.prisma.inventoryMovement.aggregate({
          where: { lotId: soapLotId, warehouseId },
          _sum: { quantity: true },
        })
      )._sum.quantity!.eq('5'),
    ).toBe(true);
    const dashboard = data<Dashboard>(
      await get(`production/dashboard?productId=${productId(P.BAR)}`, 'ADMIN').expect(200),
    );
    expect(dashboard.orders).toMatchObject({ completed: 2, inProgress: 0 });
    expect(dashboard.quantity).toMatchObject({
      planned: '11.0000',
      produced: '11.0000',
      unit: 'UNIT',
    });
    expect(dashboard.recentOrders).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: bar.id, status: 'COMPLETED' })]),
    );

    // 7. Líquido: segundo filtrado, envases reales, ruta y proceso IIoT propios.
    const liquidFilter = await order(P.ACU_FIL, '1500');
    await requirements(liquidFilter.id, { [P.ACU]: '1500' });
    await start(liquidFilter.id);
    const liquidOil = await complete(liquidFilter.id, '1500', P.ACU, rawOilLotId, '1500');
    expect(liquidOil.status).toBe('RELEASED');
    const liquid = await order(P.LIQUID, '10');
    await requirements(liquid.id, {
      [P.ACU_FIL]: '1500',
      [P.NAOH]: '200',
      [P.WATER]: '3000',
      [P.ESSENCE]: '30',
      [P.BOTTLE]: '10',
      [P.CAP]: '10',
      [P.LABEL]: '10',
    });
    const route = await kit.prisma.productionRoute.findFirstOrThrow({
      where: { productId: productId(P.LIQUID), isActive: true },
      include: { operations: { orderBy: { sequence: 'asc' } } },
    });
    expect(route.operations.map((operation) => operation.name).join(' ')).toMatch(/embotellado/i);
    expect(route.operations.map((operation) => operation.name).join(' ')).toMatch(/tapado/i);
    expect(route.operations.map((operation) => operation.name).join(' ')).toMatch(/etiquetado/i);
    await start(liquid.id);
    await simulate(liquid.id, 'liquid', 'normal');
    const liquidLot = await complete(liquid.id, '10', P.ACU_FIL, liquidOil.id, '1500');
    expect(liquidLot.status).toBe('QUARANTINED');
    await movements(liquid.id, {
      [P.ACU_FIL]: '-1500',
      [P.NAOH]: '-200',
      [P.WATER]: '-3000',
      [P.ESSENCE]: '-30',
      [P.BOTTLE]: '-10',
      [P.CAP]: '-10',
      [P.LABEL]: '-10',
      [P.LIQUID]: '10',
    });
    await inspect(liquidLot.id);
    const liquidCarbon = await footprint(liquid.id, [
      P.ACU_FIL,
      P.NAOH,
      P.WATER,
      P.ESSENCE,
      P.BOTTLE,
      P.CAP,
      P.LABEL,
    ]);
    for (const code of [P.BOTTLE, P.CAP, P.LABEL])
      expect(
        liquidCarbon.activities.find(
          (activity) => activity.inventoryMovement?.product.code === code,
        )?.category,
      ).toBe('PACKAGING');

    // 8. Regresión C2 independiente: fabricar muestra pequeña con aceite restante y rechazar.
    const rejectFilter = await order(P.ACU_FIL, '500');
    await start(rejectFilter.id);
    const rejectOil = await complete(rejectFilter.id, '500', P.ACU, rawOilLotId, '500');
    const rejectOrder = await order(P.BAR, '1');
    await start(rejectOrder.id);
    const rejectLot = await complete(rejectOrder.id, '1', P.ACU_FIL, rejectOil.id, '500');
    await inspect(rejectLot.id, 'REJECTED');
    await post(`production/lots/${rejectLot.id}/disposition`)
      .send({ type: 'SCRAP', reason: 'Regresión integrada C2' })
      .expect(201);
    expect((await kit.prisma.lot.findUniqueOrThrow({ where: { id: rejectLot.id } })).status).toBe(
      'SCRAPPED',
    );
    await stock(P.BAR, '5');
    await stock(P.ACU, '2500');

    // 9. Policies reales: tres denegaciones funcionales; ningún cambio de roles.
    await post(`${opPath(bar.id)}/complete`, 'VENTAS')
      .send({ quantityProduced: '10', allocations: [] })
      .expect(403);
    await post(`${footprintPath(bar.id)}/finalize`, 'COMPRAS')
      .send({ boundaryNotes: 'Intento no autorizado de compras' })
      .expect(403);
    await post('sustainability/emission-factors').send({}).expect(403);

    // 10. Auditoría selectiva vinculada a IDs creados aquí, no a pruebas anteriores.
    for (const [action, entityId, role] of [
      ['CONFIRM', purchase.id, 'COMPRAS'],
      ['RECEIVE', receipt.id, 'COMPRAS'],
      ['COMPLETE', bar.id, 'PRODUCCION'],
      ['QUALITY_APPROVE', inspectionId, 'PRODUCCION'],
      ['FINALIZE_CARBON_FOOTPRINT', carbon.id, 'PRODUCCION'],
      ['CONFIRM', sale.id, 'VENTAS'],
      ['DISPATCH', dispatch.id, 'VENTAS'],
    ] as const) {
      const logs = await kit.prisma.auditLog.findMany({
        where: { entityId },
        include: { actorUser: { include: { role: true } } },
      });
      expect(
        logs.some((log) => log.action === action && log.actorUser?.role.code === role),
        `${action} ${entityId}`,
      ).toBe(true);
    }
    // D6: composition compatibility after the real defense flow, without a duplicate API.
    const calendar = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Managua',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(new Date())
        .map(({ type, value }) => [type, value]),
    );
    const to = `${calendar.year}-${calendar.month}-${calendar.day}`;
    const from = new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
    const commonQuery = new URLSearchParams({ from, to });
    const productionSummary = data<Dashboard>(
      await get(`production/dashboard?${commonQuery}`).expect(200),
    );
    const inventorySummary = data<Awaited<ReturnType<InventoryDashboardService['get']>>>(
      await get(`inventory/dashboard?${commonQuery}`).expect(200),
    );
    const purchasesSummary = data<Awaited<ReturnType<PurchasesDashboardService['get']>>>(
      await get(`purchases/dashboard?${commonQuery}`).expect(200),
    );
    const salesSummary = data<Awaited<ReturnType<SalesDashboardService['get']>>>(
      await get(`sales/dashboard?${commonQuery}`).expect(200),
    );
    const qualitySummary = data<Awaited<ReturnType<QualityDashboardService['get']>>>(
      await get(`production/quality/dashboard?${commonQuery}`).expect(200),
    );
    for (const summary of [
      productionSummary,
      inventorySummary,
      purchasesSummary,
      salesSummary,
      qualitySummary,
    ])
      expect(summary.period).toEqual({ from, to, timeZone: 'America/Managua', granularity: 'day' });
    expect(productionSummary.orders.completed).toBeGreaterThan(0);
    expect(inventorySummary.movements.total).toBeGreaterThan(0);
    expect(purchasesSummary.receipts.total).toBeGreaterThan(0);
    expect(salesSummary.dispatches.total).toBeGreaterThan(0);
    expect(qualitySummary.inspections.total).toBeGreaterThan(0);

    const after = await verifyDemoDataset(kit.prisma);
    expect(formatChecks(after).ready).toBe(false);
    expect(after).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Current inventory readiness', status: 'FAIL' }),
        expect.objectContaining({ label: 'Initial stock ledger', status: 'PASS' }),
      ]),
    );
    console.info(
      JSON.stringify({
        purchase: purchase.id,
        receipt: receipt.id,
        rawOilLotId,
        filteredOrder: filtered.id,
        filteredOilLotId,
        barOrder: bar.id,
        soapLotId,
        deviationOrder: deviation.id,
        footprint: carbon.id,
        sale: sale.id,
        dispatch: dispatch.id,
        liquidOrder: liquid.id,
        liquidLot: liquidLot.id,
        liquidFootprint: liquidCarbon.id,
        finalBarStock: '5',
        demoBefore: 'READY',
        demoAfter: 'NOT READY',
      }),
    );
  });
});
