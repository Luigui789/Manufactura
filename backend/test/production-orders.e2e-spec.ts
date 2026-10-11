import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service.js';
import {
  AdjustmentReason,
  AuditAction,
  DocumentType,
  InventoryMovementType,
  LotStatus,
  ProductType,
  ProductionOrderStatus,
  RoleCode,
  UnitOfMeasure,
  type Product,
  type Warehouse,
} from '../src/generated/prisma/client.js';
import {
  InventoryService,
  type MovementLine,
} from '../src/inventory/movements/inventory.service.js';
import {
  createTestApp,
  createUser,
  login,
  type TestApp,
  type TestUser,
} from './support/auth-test-kit.js';
import {
  createInventoryLot,
  createInventoryProduct,
  createInventoryWarehouse,
} from './support/inventory-fixtures.js';

const base = '/api/production/orders';
const boms = '/api/production/boms';
let kit: TestApp;
let actor: TestUser;
const cookies = new Map<RoleCode, string>();
type Order = {
  id: string;
  number: string;
  productId: string;
  bomVersionId: string;
  warehouseId: string;
  quantityPlanned: string;
  quantityProduced: string;
  status: ProductionOrderStatus;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdByUserId: string;
  createdAt: string;
  bomVersion: { id: string; version: number; isActive: boolean };
};
type Requirements = {
  orderId: string;
  bomVersionId: string;
  version: number;
  quantityPlanned: string;
  warehouseId: string;
  canStart: boolean;
  eligibilityIssues: string[];
  items: { product: { id: string }; required: string; available: string; shortage: string }[];
};
type Fixture = {
  output: Product;
  components: Product[];
  warehouse: Warehouse;
  bomId: string;
  versionId: string;
  payload: {
    productId: string;
    bomVersionId: string;
    warehouseId: string;
    quantityPlanned: string;
  };
};
const inventoryBaselines = new Map<Fixture, unknown>();

function data<T>(response: { body: unknown }): T {
  return (response.body as { data: T }).data;
}
function post(path: string = base, role: RoleCode = RoleCode.PRODUCCION) {
  return kit.http().post(path).set('Cookie', cookies.get(role)!);
}
function patch(id: string, role: RoleCode = RoleCode.PRODUCCION) {
  return kit
    .http()
    .patch(base + '/' + id)
    .set('Cookie', cookies.get(role)!);
}
function get(path: string, role: RoleCode = RoleCode.PRODUCCION) {
  return kit.http().get(path).set('Cookie', cookies.get(role)!);
}
function businessYear(instant: string | Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Managua', year: 'numeric' })
      .formatToParts(new Date(instant))
      .find((part) => part.type === 'year')!.value,
  );
}
async function sequence() {
  return kit.prisma.documentSequence.findUnique({
    where: { documentType_year: { documentType: DocumentType.OP, year: businessYear() } },
  });
}
async function inventorySnapshot(f: Fixture) {
  const productIds = [f.output.id, ...f.components.map((product) => product.id)];
  const [movements, balances, lots, lotSequences] = await Promise.all([
    kit.prisma.inventoryMovement.findMany({
      where: { productId: { in: productIds } },
      orderBy: { id: 'asc' },
    }),
    kit.prisma.stockBalance.findMany({
      where: { productId: { in: productIds } },
      orderBy: { id: 'asc' },
    }),
    kit.prisma.lot.findMany({ where: { productId: { in: productIds } }, orderBy: { id: 'asc' } }),
    kit.prisma.documentSequence.findMany({
      where: { documentType: DocumentType.LOT },
      orderBy: { year: 'asc' },
    }),
  ]);
  return { movements, balances, lots, lotSequences };
}
async function fixture(
  options: { tracked?: boolean[]; outputQuantity?: string; componentQuantity?: string } = {},
): Promise<Fixture> {
  const rawOutput = await createInventoryProduct(kit.prisma, { isLotTracked: true });
  const output = await kit.prisma.product.update({
    where: { id: rawOutput.id },
    data: { type: ProductType.FINISHED_GOOD, unit: UnitOfMeasure.UNIT },
  });
  const components = await Promise.all(
    (options.tracked ?? [false]).map((isLotTracked) =>
      createInventoryProduct(kit.prisma, { isLotTracked }),
    ),
  );
  const warehouse = await createInventoryWarehouse(kit.prisma);
  const bom = data<{ id: string }>(
    await post(boms)
      .send({ productId: output.id, name: 'OP C-1 ' + randomUUID() })
      .expect(201),
  );
  const version = data<{ id: string }>(
    await post(boms + '/' + bom.id + '/versions')
      .send({
        outputQuantity: options.outputQuantity ?? '1',
        items: components.map((component) => ({
          productId: component.id,
          quantity: options.componentQuantity ?? '2',
        })),
      })
      .expect(201),
  );
  const f: Fixture = {
    output,
    components,
    warehouse,
    bomId: bom.id,
    versionId: version.id,
    payload: {
      productId: output.id,
      bomVersionId: version.id,
      warehouseId: warehouse.id,
      quantityPlanned: '10',
    },
  };
  inventoryBaselines.set(f, await inventorySnapshot(f));
  return f;
}
async function create(f: Fixture, changes: Record<string, unknown> = {}) {
  return data<Order>(
    await post()
      .send({ ...f.payload, ...changes })
      .expect(201),
  );
}
async function requirements(orderId: string) {
  return data<Requirements>(await get(base + '/' + orderId + '/requirements').expect(200));
}
async function additionalVersion(f: Fixture) {
  return data<{ id: string }>(
    await post(boms + '/' + f.bomId + '/versions')
      .send({
        outputQuantity: '1',
        items: f.components.map((component) => ({ productId: component.id, quantity: '3' })),
      })
      .expect(201),
  );
}
async function stock(f: Fixture, lines: MovementLine[]) {
  // Fixture writes deliberately use A-1's single writer, never production endpoints.
  // Check earlier operations before establishing the next fixture-stock baseline.
  expect(await inventorySnapshot(f)).toEqual(inventoryBaselines.get(f));
  await kit.prisma.$transaction((tx) =>
    kit.app.get(InventoryService).applyMovements(tx, {
      performedByUserId: actor.id,
      lines,
    }),
  );
  inventoryBaselines.set(f, await inventorySnapshot(f));
}
function stockLine(
  productId: string,
  warehouseId: string,
  quantity: string,
  lotId?: string,
): MovementLine {
  return {
    type: InventoryMovementType.ADJUSTMENT_IN,
    productId,
    warehouseId,
    quantity,
    lotId,
    origin: { kind: 'ADJUSTMENT', reason: AdjustmentReason.INITIAL_LOAD },
  };
}

beforeAll(async () => {
  kit = await createTestApp();
  for (const role of Object.values(RoleCode)) {
    const user = await createUser(kit, role);
    if (role === RoleCode.PRODUCCION) actor = user;
    cookies.set(role, await login(kit, user));
  }
}, 30000);
afterEach(async () => {
  try {
    // Applies to successful reads/writes and every rejected, failed or concurrent request.
    for (const [f, before] of inventoryBaselines) {
      expect(await inventorySnapshot(f)).toEqual(before);
    }
  } finally {
    inventoryBaselines.clear();
    vi.restoreAllMocks();
  }
});
afterAll(async () => {
  if (kit) await kit.close();
});

describe('C-1: planificación de órdenes y disponibilidad informativa', () => {
  it('crea DRAFT con secuencia OP real, cantidades string y auditoría correlacionada', async () => {
    const f = await fixture();
    const before = await sequence();
    const response = await post().send(f.payload).expect(201);
    const order = data<Order>(response);
    expect(order).toMatchObject({
      productId: f.output.id,
      bomVersionId: f.versionId,
      warehouseId: f.warehouse.id,
      quantityPlanned: '10.0000',
      quantityProduced: '0.0000',
      status: 'DRAFT',
      plannedStartAt: null,
      plannedEndAt: null,
      startedAt: null,
      completedAt: null,
      createdByUserId: actor.id,
    });
    expect(order.number).toBe(
      `OP-${businessYear(order.createdAt)}-${String((before?.lastNumber ?? 0) + 1).padStart(6, '0')}`,
    );
    expect((await sequence())?.lastNumber).toBe((before?.lastNumber ?? 0) + 1);
    const logs = await kit.prisma.auditLog.findMany({
      where: { requestId: response.headers['x-request-id'] },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      entityType: 'PRODUCTION_ORDER',
      entityId: order.id,
      action: 'CREATE',
      actorUserId: actor.id,
      newValues: {
        number: order.number,
        bomVersionId: f.versionId,
        quantityPlanned: '10.0000',
        status: 'DRAFT',
        plannedStartAt: null,
      },
    });
    expect(Object.keys(logs[0].newValues as object).sort()).toEqual(
      [
        'number',
        'productId',
        'bomVersionId',
        'warehouseId',
        'quantityPlanned',
        'status',
        'plannedStartAt',
        'plannedEndAt',
        'createdByUserId',
      ].sort(),
    );
  });

  it('conserva fechas opcionales, normaliza offsets a UTC y rechaza ventanas o timestamps inválidos', async () => {
    const f = await fixture();
    expect(await create(f, { plannedStartAt: null, plannedEndAt: null })).toMatchObject({
      plannedStartAt: null,
      plannedEndAt: null,
    });
    expect(
      await create(f, {
        plannedStartAt: '2026-12-31T23:30:00-06:00',
        plannedEndAt: '2027-01-01T06:00:00Z',
      }),
    ).toMatchObject({
      plannedStartAt: '2027-01-01T05:30:00.000Z',
      plannedEndAt: '2027-01-01T06:00:00.000Z',
    });
    expect(await create(f, { plannedEndAt: '2027-01-01T06:00:00Z' })).toMatchObject({
      plannedStartAt: null,
      plannedEndAt: '2027-01-01T06:00:00.000Z',
    });
    for (const invalid of ['2026-10-10', '2026-10-10T10:30:00', '2026-02-30T10:30:00Z', 123]) {
      await post()
        .send({ ...f.payload, plannedStartAt: invalid })
        .expect(400);
    }
    await post()
      .send({
        ...f.payload,
        plannedStartAt: '2026-10-10T12:00:00Z',
        plannedEndAt: '2026-10-10T11:59:00Z',
      })
      .expect(422);
  });

  it('edita parcialmente sin perder campos, valida la ventana combinada y permite limpiar fechas con null', async () => {
    const f = await fixture();
    const order = await create(f, {
      plannedStartAt: '2026-10-10T12:00:00Z',
      plannedEndAt: '2026-10-10T14:00:00Z',
    });
    const changed = await patch(order.id)
      .send({ quantityPlanned: '12', plannedStartAt: '2026-10-10T13:00:00Z' })
      .expect(200);
    expect(data<Order>(changed)).toMatchObject({
      number: order.number,
      bomVersionId: f.versionId,
      warehouseId: f.warehouse.id,
      quantityPlanned: '12.0000',
      plannedStartAt: '2026-10-10T13:00:00.000Z',
      plannedEndAt: order.plannedEndAt,
    });
    const audit = await kit.prisma.auditLog.findFirstOrThrow({
      where: { requestId: changed.headers['x-request-id'] },
    });
    expect(audit).toMatchObject({
      action: 'UPDATE',
      previousValues: { quantityPlanned: '10.0000', plannedStartAt: order.plannedStartAt },
      newValues: { quantityPlanned: '12.0000', plannedStartAt: '2026-10-10T13:00:00.000Z' },
    });
    await patch(order.id).send({ plannedEndAt: '2026-10-10T12:59:00Z' }).expect(422);
    await patch(order.id).send({ plannedStartAt: '2026-10-10T14:01:00Z' }).expect(422);
    const cleared = data<Order>(await patch(order.id).send({ plannedStartAt: null }).expect(200));
    expect(cleared).toMatchObject({ plannedStartAt: null, plannedEndAt: order.plannedEndAt });
    expect(
      data<Order>(await patch(order.id).send({ plannedEndAt: null }).expect(200)),
    ).toMatchObject({ plannedStartAt: null, plannedEndAt: null });
    await patch(order.id).send({}).expect(400);
  });

  it('mantiene la versión persistida tras otra activación y calcula/edita con su contenido histórico', async () => {
    const f = await fixture();
    const order = await create(f);
    const next = await additionalVersion(f);
    await post(boms + '/' + f.bomId + '/versions/' + next.id + '/activate')
      .send({})
      .expect(200);
    expect(data<Order>(await get(base + '/' + order.id).expect(200))).toMatchObject({
      bomVersionId: f.versionId,
      bomVersion: { id: f.versionId, isActive: false },
    });
    expect(
      data<Order>(await patch(order.id).send({ quantityPlanned: '12' }).expect(200)),
    ).toMatchObject({ bomVersionId: f.versionId, quantityPlanned: '12.0000' });
    expect(await requirements(order.id)).toMatchObject({
      bomVersionId: f.versionId,
      version: 1,
      items: [{ required: '24.0000' }],
    });
    await patch(order.id).send({ bomVersionId: next.id }).expect(200);
    await patch(order.id).send({ bomVersionId: f.versionId }).expect(409);
  });

  it('rechaza seleccionar versiones inactivas, ajenas, inexistentes o de una fórmula inactiva', async () => {
    const f = await fixture();
    const other = await fixture();
    const inactive = await additionalVersion(f);
    await post()
      .send({ ...f.payload, bomVersionId: inactive.id })
      .expect(409);
    await post()
      .send({ ...f.payload, bomVersionId: other.versionId })
      .expect(422);
    await post()
      .send({ ...f.payload, bomVersionId: randomUUID() })
      .expect(404);
    const order = await create(f);
    await patch(order.id).send({ productId: other.output.id }).expect(422);
    await patch(order.id).send({ bomVersionId: inactive.id }).expect(409);
    await kit
      .http()
      .patch(boms + '/' + f.bomId + '/status')
      .set('Cookie', cookies.get(RoleCode.PRODUCCION)!)
      .send({ isActive: false })
      .expect(200);
    await post().send(f.payload).expect(409);
    await patch(order.id).send({ quantityPlanned: '11' }).expect(409);
  });

  it('revalida salida, componentes y almacén activos al crear y editar', async () => {
    const f = await fixture();
    const order = await create(f);
    for (const id of [f.output.id, f.components[0].id]) {
      await kit.prisma.product.update({ where: { id }, data: { isActive: false } });
      await post().send(f.payload).expect(422);
      await patch(order.id).send({ quantityPlanned: '11' }).expect(422);
      await kit.prisma.product.update({ where: { id }, data: { isActive: true } });
    }
    await kit.prisma.warehouse.update({ where: { id: f.warehouse.id }, data: { isActive: false } });
    await post().send(f.payload).expect(422);
    await patch(order.id).send({ quantityPlanned: '11' }).expect(422);
    await post()
      .send({ ...f.payload, warehouseId: randomUUID() })
      .expect(404);
  });

  it('rechaza floats, cantidades inválidas, null en referencias y campos de ejecución o estado', async () => {
    const f = await fixture();
    const order = await create(f);
    for (const value of [1, 0.1, null, '0', '-1', '1e3', '1.00001', '100000000000000']) {
      await post()
        .send({ ...f.payload, quantityPlanned: value })
        .expect(400);
      await patch(order.id).send({ quantityPlanned: value }).expect(400);
    }
    for (const field of ['productId', 'bomVersionId', 'warehouseId']) {
      await patch(order.id)
        .send({ [field]: null })
        .expect(400);
    }
    for (const extra of [
      { status: 'COMPLETED' },
      { quantityProduced: '9' },
      { startedAt: '2026-10-10T12:00:00Z' },
      { completedAt: '2026-10-10T13:00:00Z' },
      { number: 'OP-CLIENT' },
      { unknown: true },
    ]) {
      await post()
        .send({ ...f.payload, ...extra })
        .expect(400);
      await patch(order.id).send(extra).expect(400);
    }
    expect(data<Order>(await get(base + '/' + order.id).expect(200))).toMatchObject({
      quantityPlanned: '10.0000',
      status: 'DRAFT',
      quantityProduced: '0.0000',
    });
  });

  it('rechaza requerimientos no representables o fuera de Decimal(18,4) sin redondear', async () => {
    const f = await fixture({ outputQuantity: '3', componentQuantity: '1' });
    await post()
      .send({ ...f.payload, quantityPlanned: '1' })
      .expect(422);
    const order = await create(f, { quantityPlanned: '3' });
    await patch(order.id).send({ quantityPlanned: '1' }).expect(422);
    expect(await requirements(order.id)).toMatchObject({ items: [{ required: '1.0000' }] });
    const overflow = await fixture({ componentQuantity: '99999999999999.9999' });
    await post()
      .send({ ...overflow.payload, quantityPlanned: '2' })
      .expect(422);
    expect(
      await kit.prisma.productionOrder.count({ where: { productId: overflow.output.id } }),
    ).toBe(0);
  });

  it('cancela solamente DRAFT y audita CANCEL_PRODUCTION, sin modificar órdenes en ejecución o completadas', async () => {
    const f = await fixture();
    const order = await create(f);
    const response = await post(base + '/' + order.id + '/cancel')
      .send({})
      .expect(200);
    expect(data<Order>(response)).toMatchObject({
      status: 'CANCELLED',
      quantityProduced: '0.0000',
      startedAt: null,
      completedAt: null,
    });
    expect(
      await kit.prisma.auditLog.findFirstOrThrow({
        where: { requestId: response.headers['x-request-id'] },
      }),
    ).toMatchObject({
      action: 'CANCEL_PRODUCTION',
      entityId: order.id,
      previousValues: { status: 'DRAFT' },
      newValues: { status: 'CANCELLED' },
    });
    await post(base + '/' + order.id + '/cancel')
      .send({})
      .expect(409);
    await patch(order.id).send({ quantityPlanned: '11' }).expect(409);
    for (const status of [ProductionOrderStatus.IN_PROGRESS, ProductionOrderStatus.COMPLETED]) {
      const execution = await create(f);
      // C-2 is absent: install its status directly to prove the C-1 state boundary.
      await kit.prisma.productionOrder.update({ where: { id: execution.id }, data: { status } });
      await post(base + '/' + execution.id + '/cancel')
        .send({})
        .expect(409);
      await patch(execution.id).send({ quantityPlanned: '11' }).expect(409);
      expect(
        (await kit.prisma.productionOrder.findUniqueOrThrow({ where: { id: execution.id } }))
          .status,
      ).toBe(status);
    }
  });

  it('permite leer a todos los roles y reserva create/update/cancel a ADMIN y PRODUCCION', async () => {
    const f = await fixture();
    const order = await create(f);
    for (const role of Object.values(RoleCode)) {
      await get(base, role).expect(200);
      await get(base + '/' + order.id, role).expect(200);
      await get(base + '/' + order.id + '/requirements', role).expect(200);
      const canWrite = role === RoleCode.ADMIN || role === RoleCode.PRODUCCION;
      const response = await post(base, role)
        .send(f.payload)
        .expect(canWrite ? 201 : 403);
      const target = canWrite ? data<Order>(response).id : order.id;
      await patch(target, role)
        .send({ quantityPlanned: '11' })
        .expect(canWrite ? 200 : 403);
      await post(base + '/' + target + '/cancel', role)
        .send({})
        .expect(canWrite ? 200 : 403);
    }
    expect(
      (await kit.prisma.productionOrder.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe('DRAFT');
  });

  it('niega todos los endpoints anónimos y devuelve 400/404 en identificadores inválidos o ausentes', async () => {
    const f = await fixture();
    const order = await create(f);
    for (const path of [base, base + '/' + order.id, base + '/' + order.id + '/requirements']) {
      await kit.http().get(path).expect(401);
    }
    await kit.http().post(base).send(f.payload).expect(401);
    await kit
      .http()
      .patch(base + '/' + order.id)
      .send({ quantityPlanned: '11' })
      .expect(401);
    await kit
      .http()
      .post(base + '/' + order.id + '/cancel')
      .send({})
      .expect(401);
    for (const id of ['invalid', randomUUID()]) {
      const status = id === 'invalid' ? 400 : 404;
      await get(base + '/' + id).expect(status);
      await get(base + '/' + id + '/requirements').expect(status);
      await patch(id).send({ quantityPlanned: '11' }).expect(status);
      await post(base + '/' + id + '/cancel')
        .send({})
        .expect(status);
    }
  });

  it('pagina y filtra por estado, producto, almacén y número, con contrato data/meta', async () => {
    const f = await fixture();
    const first = await create(f);
    const second = await create(f);
    await post(base + '/' + first.id + '/cancel')
      .send({})
      .expect(200);
    const response = await get(base)
      .query({ productId: f.output.id, warehouseId: f.warehouse.id, page: 1, limit: 1 })
      .expect(200);
    expect(response.body).toMatchObject({ meta: { page: 1, limit: 1, total: 2 } });
    expect(data<Order[]>(response)).toHaveLength(1);
    const filtered = await get(base)
      .query({ productId: f.output.id, status: 'DRAFT', search: second.number })
      .expect(200);
    expect(data<Order[]>(filtered).map((order) => order.id)).toEqual([second.id]);
    const cancelled = await get(base)
      .query({ productId: f.output.id, status: 'CANCELLED' })
      .expect(200);
    expect(data<Order[]>(cancelled).map((order) => order.id)).toEqual([first.id]);
    await get(base).query({ status: 'UNKNOWN' }).expect(400);
  });

  it('calcula faltantes con saldo real de productos sin lote y no reserva stock al consultar', async () => {
    const f = await fixture();
    const order = await create(f);
    expect(await requirements(order.id)).toMatchObject({
      quantityPlanned: '10.0000',
      canStart: false,
      items: [{ required: '20.0000', available: '0.0000', shortage: '20.0000' }],
    });
    await stock(f, [stockLine(f.components[0].id, f.warehouse.id, '25')]);
    for (let count = 0; count < 2; count += 1) {
      expect(await requirements(order.id)).toMatchObject({
        canStart: true,
        eligibilityIssues: [],
        items: [{ required: '20.0000', available: '25.0000', shortage: '0.0000' }],
      });
    }
    await patch(order.id).send({ quantityPlanned: '15' }).expect(200);
    expect(await requirements(order.id)).toMatchObject({
      canStart: false,
      items: [{ required: '30.0000', available: '25.0000', shortage: '5.0000' }],
    });
  });

  it('cuenta solo lotes RELEASED del almacén de la OP y excluye cuarentena, rechazo y otros almacenes', async () => {
    const f = await fixture({ tracked: [true, false] });
    const tracked = f.components[0];
    const released = await createInventoryLot(kit.prisma, tracked.id, LotStatus.RELEASED);
    const quarantined = await createInventoryLot(kit.prisma, tracked.id, LotStatus.QUARANTINED);
    const rejected = await createInventoryLot(kit.prisma, tracked.id, LotStatus.REJECTED);
    const otherWarehouse = await createInventoryWarehouse(kit.prisma);
    // Lots are intentional test fixtures; start the stock baseline after their creation.
    inventoryBaselines.set(f, await inventorySnapshot(f));
    await stock(f, [
      stockLine(tracked.id, f.warehouse.id, '10', released.id),
      stockLine(tracked.id, f.warehouse.id, '100', quarantined.id),
      stockLine(tracked.id, f.warehouse.id, '100', rejected.id),
      stockLine(tracked.id, otherWarehouse.id, '70', released.id),
      stockLine(f.components[1].id, f.warehouse.id, '25'),
    ]);
    const order = await create(f);
    const result = await requirements(order.id);
    expect(result.canStart).toBe(false);
    expect(result.items.find((item) => item.product.id === tracked.id)).toMatchObject({
      required: '20.0000',
      available: '10.0000',
      shortage: '10.0000',
    });
    expect(result.items.find((item) => item.product.id === f.components[1].id)).toMatchObject({
      required: '20.0000',
      available: '25.0000',
      shortage: '0.0000',
    });
    await stock(f, [stockLine(tracked.id, f.warehouse.id, '10', released.id)]);
    expect((await requirements(order.id)).canStart).toBe(true);
  });

  it('informa inelegibilidad de catálogos y orden cancelada aunque el stock sea suficiente', async () => {
    const f = await fixture();
    await stock(f, [stockLine(f.components[0].id, f.warehouse.id, '25')]);
    const order = await create(f);
    expect((await requirements(order.id)).canStart).toBe(true);
    await kit.prisma.product.update({
      where: { id: f.components[0].id },
      data: { isActive: false },
    });
    let result = await requirements(order.id);
    expect(result.canStart).toBe(false);
    expect(result.eligibilityIssues).toContain(
      'Los componentes deben estar activos y ser materia prima, consumible o intermedio',
    );
    await kit.prisma.product.update({
      where: { id: f.components[0].id },
      data: { isActive: true },
    });
    await kit.prisma.warehouse.update({ where: { id: f.warehouse.id }, data: { isActive: false } });
    result = await requirements(order.id);
    expect(result.canStart).toBe(false);
    expect(result.eligibilityIssues).toContain('El almacén está inactivo');
    await kit.prisma.warehouse.update({ where: { id: f.warehouse.id }, data: { isActive: true } });
    await post(base + '/' + order.id + '/cancel')
      .send({})
      .expect(200);
    result = await requirements(order.id);
    expect(result.canStart).toBe(false);
    expect(result.eligibilityIssues).toContain('La orden no está en borrador');
    expect(result.items[0]).toMatchObject({ available: '25.0000', shortage: '0.0000' });
  });

  it('revierte creación, auditoría y contador OP si falla audit.record', async () => {
    const f = await fixture();
    const before = await sequence();
    const auditCount = await kit.prisma.auditLog.count({
      where: { entityType: 'PRODUCTION_ORDER' },
    });
    vi.spyOn(kit.app.get(AuditService), 'record').mockRejectedValueOnce(
      new Error('Fallo controlado de auditoría OP'),
    );
    const failed = await post().send(f.payload).expect(500);
    expect(await kit.prisma.productionOrder.count({ where: { productId: f.output.id } })).toBe(0);
    expect(await sequence()).toEqual(before);
    expect(await kit.prisma.auditLog.count({ where: { entityType: 'PRODUCTION_ORDER' } })).toBe(
      auditCount,
    );
    expect(
      await kit.prisma.auditLog.count({ where: { requestId: failed.headers['x-request-id'] } }),
    ).toBe(0);
    const published = await create(f);
    expect(published.number).toBe(
      `OP-${businessYear(published.createdAt)}-${String((before?.lastNumber ?? 0) + 1).padStart(6, '0')}`,
    );
  });

  it('revierte edición y cancelación completas si falla la auditoría, manteniendo DRAFT', async () => {
    const f = await fixture();
    const order = await create(f);
    const before = await kit.prisma.productionOrder.findUniqueOrThrow({ where: { id: order.id } });
    const auditCount = await kit.prisma.auditLog.count({ where: { entityId: order.id } });
    const failure = vi.spyOn(kit.app.get(AuditService), 'record');
    failure.mockRejectedValueOnce(new Error('Fallo controlado de edición OP'));
    await patch(order.id)
      .send({ quantityPlanned: '11', plannedStartAt: '2026-10-10T12:00:00Z' })
      .expect(500);
    expect(await kit.prisma.productionOrder.findUniqueOrThrow({ where: { id: order.id } })).toEqual(
      before,
    );
    failure.mockRejectedValueOnce(new Error('Fallo controlado de cancelación OP'));
    await post(base + '/' + order.id + '/cancel')
      .send({})
      .expect(500);
    expect(await kit.prisma.productionOrder.findUniqueOrThrow({ where: { id: order.id } })).toEqual(
      before,
    );
    expect(await kit.prisma.auditLog.count({ where: { entityId: order.id } })).toBe(auditCount);
  });

  it('crea números únicos consecutivos bajo concurrencia, incluso entre fórmulas distintas', async () => {
    const first = await fixture();
    const second = await fixture();
    const before = await sequence();
    const orders = await Promise.all([
      create(first),
      create(second),
      create(first),
      create(second),
    ]);
    expect(new Set(orders.map((order) => order.number)).size).toBe(4);
    const suffixes = orders
      .map((order) => Number(order.number.split('-')[2]))
      .sort((a, b) => a - b);
    expect(suffixes).toEqual([1, 2, 3, 4].map((offset) => (before?.lastNumber ?? 0) + offset));
    expect((await sequence())?.lastNumber).toBe((before?.lastNumber ?? 0) + 4);
    expect(
      await kit.prisma.auditLog.count({
        where: { entityId: { in: orders.map((order) => order.id) }, action: AuditAction.CREATE },
      }),
    ).toBe(4);
  });

  it('serializa cancelaciones concurrentes: una confirma y otra recibe conflicto, con una sola auditoría', async () => {
    const f = await fixture();
    const order = await create(f);
    const responses = await Promise.all([
      post(base + '/' + order.id + '/cancel').send({}),
      post(base + '/' + order.id + '/cancel').send({}),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(
      await kit.prisma.auditLog.count({
        where: { entityId: order.id, action: AuditAction.CANCEL_PRODUCTION },
      }),
    ).toBe(1);
    expect(
      (await kit.prisma.productionOrder.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe('CANCELLED');
  });

  it('combina PATCH parciales concurrentes bajo el mutex de la OP y conserva una ventana válida', async () => {
    const f = await fixture();
    const order = await create(f, {
      plannedStartAt: '2026-10-10T12:00:00Z',
      plannedEndAt: '2026-10-10T14:00:00Z',
    });
    const [start, end] = await Promise.all([
      patch(order.id).send({ plannedStartAt: '2026-10-10T13:00:00Z' }),
      patch(order.id).send({ plannedEndAt: '2026-10-10T12:30:00Z' }),
    ]);
    expect([start.status, end.status].sort()).toEqual([200, 422]);
    const final = await kit.prisma.productionOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(final.plannedEndAt!.getTime()).toBeGreaterThanOrEqual(final.plannedStartAt!.getTime());
    expect(final.plannedStartAt!.toISOString()).toBe(
      start.status === 200 ? '2026-10-10T13:00:00.000Z' : '2026-10-10T12:00:00.000Z',
    );
    expect(final.plannedEndAt!.toISOString()).toBe(
      end.status === 200 ? '2026-10-10T12:30:00.000Z' : '2026-10-10T14:00:00.000Z',
    );
    expect(final).toMatchObject({
      productId: order.productId,
      bomVersionId: order.bomVersionId,
      warehouseId: order.warehouseId,
    });
    const logs = await kit.prisma.auditLog.findMany({
      where: { entityId: order.id, action: AuditAction.UPDATE },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].newValues).toEqual(
      start.status === 200
        ? { plannedStartAt: '2026-10-10T13:00:00.000Z' }
        : { plannedEndAt: '2026-10-10T12:30:00.000Z' },
    );
  });

  it('revalida la versión activa tras esperar el mutex BOM y rechaza una selección recién desactivada', async () => {
    const f = await fixture();
    const next = await additionalVersion(f);
    const before = await sequence();
    const auditCount = await kit.prisma.auditLog.count({
      where: { entityType: 'PRODUCTION_ORDER' },
    });
    let request: Promise<{ status: number; headers: Record<string, string> }> | undefined;
    await kit.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bills_of_material WHERE id = ${f.bomId}::uuid FOR UPDATE`;
      request = post()
        .send(f.payload)
        .then((response) => response);
      await vi.waitFor(
        async () => {
          const waiting = await kit.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT count(*) FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock' AND query ILIKE '%bills_of_material%'
            AND query ILIKE '%FOR UPDATE%'`;
          expect(waiting[0].count > 0n).toBe(true);
        },
        { timeout: 2500, interval: 25 },
      );
      // Fixture activation while holding its real BOM mutex; no production-service mock.
      await tx.bomVersion.update({ where: { id: f.versionId }, data: { isActive: false } });
      await tx.bomVersion.update({ where: { id: next.id }, data: { isActive: true } });
    });
    const response = await request!;
    expect(response.status).toBe(409);
    expect(await sequence()).toEqual(before);
    expect(await kit.prisma.productionOrder.count({ where: { productId: f.output.id } })).toBe(0);
    expect(await kit.prisma.auditLog.count({ where: { entityType: 'PRODUCTION_ORDER' } })).toBe(
      auditCount,
    );
    expect(
      await kit.prisma.auditLog.count({ where: { requestId: response.headers['x-request-id'] } }),
    ).toBe(0);
    expect(
      (await kit.prisma.bomVersion.findUniqueOrThrow({ where: { id: f.versionId } })).isActive,
    ).toBe(false);
    expect(
      (await kit.prisma.bomVersion.findUniqueOrThrow({ where: { id: next.id } })).isActive,
    ).toBe(true);
  });

  it('PostgreSQL protege cantidades positivas, producción no negativa y ventana de fechas', async () => {
    const f = await fixture();
    const order = await create(f);
    const before = await kit.prisma.productionOrder.findUniqueOrThrow({ where: { id: order.id } });
    for (const quantityPlanned of ['0', '-0.0001']) {
      await expect(
        kit.prisma.productionOrder.update({ where: { id: order.id }, data: { quantityPlanned } }),
      ).rejects.toThrow();
    }
    await expect(
      kit.prisma.productionOrder.update({
        where: { id: order.id },
        data: { quantityProduced: '-0.0001' },
      }),
    ).rejects.toThrow();
    await expect(
      kit.prisma.productionOrder.update({
        where: { id: order.id },
        data: {
          plannedStartAt: new Date('2026-10-10T13:00:00Z'),
          plannedEndAt: new Date('2026-10-10T12:00:00Z'),
        },
      }),
    ).rejects.toThrow();
    expect(await kit.prisma.productionOrder.findUniqueOrThrow({ where: { id: order.id } })).toEqual(
      before,
    );
  });
});
