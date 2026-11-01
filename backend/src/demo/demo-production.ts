import { AuditService } from '../audit/audit.service.js';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  InventoryMovementType,
  Prisma,
} from '../generated/prisma/client.js';
import { InventoryService } from '../inventory/movements/inventory.service.js';
import { BomGraphService } from '../production/boms/bom-graph.service.js';
import {
  DEMO_BOMS,
  DEMO_INITIAL_STOCK,
  DEMO_INITIAL_STOCK_MARKER,
  DEMO_ROUTES,
  DEMO_ZERO_START,
} from './demo-data.js';
import { assertSame, drift, recordCreate, type SeedStats, type Tx } from './demo-context.js';

type Ids = Map<string, string>;
const id = (ids: Ids, code: string) => ids.get(code) ?? drift('Product ' + code, 'no existe');
const dec = (value: Prisma.Decimal | string) => new Prisma.Decimal(value).toFixed(4);

/**
 * Una fórmula por producto con v1 activa. Si ya existe, debe coincidir exactamente
 * (salida, componentes y cantidades de la versión activa); nunca se crea v2.
 */
export async function ensureDemoBoms(tx: Tx, stats: SeedStats, ids: Ids, actorId: string) {
  const graph = new BomGraphService();
  for (const spec of DEMO_BOMS) {
    const productId = id(ids, spec.productCode);
    const expectedItems = spec.items
      .map((item) => `${item.productCode}=${dec(item.quantity)}`)
      .sort()
      .join(',');
    const existing = await tx.billOfMaterial.findUnique({
      where: { productId },
      include: {
        versions: {
          where: { isActive: true },
          include: { items: { include: { componentProduct: { select: { code: true } } } } },
        },
      },
    });
    if (existing) {
      const entity = `BOM ${spec.productCode}`;
      if (!existing.isActive) drift(entity, 'la fórmula está inactiva');
      const [active] = existing.versions;
      if (!active) drift(entity, 'no tiene versión activa');
      assertSame(
        entity,
        { outputQuantity: dec(active.outputQuantity) },
        {
          outputQuantity: dec(spec.outputQuantity),
        },
      );
      const actualItems = active.items
        .map((item) => `${item.componentProduct.code}=${dec(item.quantity)}`)
        .sort()
        .join(',');
      if (actualItems !== expectedItems)
        drift(entity, `componentes ${actualItems}, se esperaba ${expectedItems}`);
      continue;
    }
    // Mismo protocolo que BomsService: lock del grafo y validación acíclica (C4).
    await graph.lock(tx);
    const components = await tx.product.findMany({
      where: { id: { in: spec.items.map((item) => id(ids, item.productCode)) } },
      select: { id: true, type: true },
    });
    await graph.assertAcyclic(tx, {
      productId,
      components: components.map((c) => ({ productId: c.id, type: c.type })),
    });
    const bom = await tx.billOfMaterial.create({
      data: {
        productId,
        name: spec.name,
        versions: {
          create: {
            version: 1,
            outputQuantity: spec.outputQuantity,
            isActive: true,
            createdByUserId: actorId,
            items: {
              create: spec.items.map((item) => ({
                componentProductId: id(ids, item.productCode),
                quantity: item.quantity,
              })),
            },
          },
        },
      },
      include: { versions: true },
    });
    await recordCreate(tx, stats, AuditEntityType.BILL_OF_MATERIAL, bom.id, {
      productCode: spec.productCode,
      name: spec.name,
    });
    await recordCreate(tx, stats, AuditEntityType.BOM_VERSION, bom.versions[0].id, {
      productCode: spec.productCode,
      version: 1,
      outputQuantity: spec.outputQuantity,
      isActive: true,
      items: spec.items.map((item) => ({ ...item })),
    });
  }
}

export async function ensureDemoRoutes(tx: Tx, stats: SeedStats, ids: Ids) {
  for (const spec of DEMO_ROUTES) {
    const productId = id(ids, spec.productCode);
    const expected = spec.operations
      .map((op) => `${op.sequence}|${op.name}|${new Prisma.Decimal(op.standardMinutes).toFixed(2)}`)
      .join(';');
    const existing =
      (await tx.productionRoute.findUnique({
        where: { productId },
        include: { operations: { orderBy: { sequence: 'asc' } } },
      })) ??
      (await tx.productionRoute.findUnique({
        where: { code: spec.code },
        include: { operations: { orderBy: { sequence: 'asc' } } },
      }));
    if (existing) {
      const entity = 'Route ' + spec.code;
      assertSame(entity, existing, { code: spec.code, productId, isActive: true });
      const actual = existing.operations
        .map((op) => `${op.sequence}|${op.name}|${op.standardMinutes.toFixed(2)}`)
        .join(';');
      if (actual !== expected) drift(entity, `operaciones ${actual}, se esperaba ${expected}`);
      continue;
    }
    const route = await tx.productionRoute.create({
      data: {
        productId,
        code: spec.code,
        name: spec.name,
        operations: {
          create: spec.operations.map((op) => ({ ...op })),
        },
      },
    });
    await recordCreate(tx, stats, AuditEntityType.PRODUCTION_ROUTE, route.id, {
      code: spec.code,
      productCode: spec.productCode,
      operations: spec.operations.map((op) => ({ ...op })),
    });
  }
}

/**
 * Stock inicial exclusivamente por InventoryService (ledger ADJUSTMENT_IN / INITIAL_LOAD).
 * La marca requestId lo hace idempotente: lo consumido después nunca se repone.
 */
export async function ensureDemoInitialStock(
  tx: Tx,
  stats: SeedStats,
  ids: Ids,
  warehouseId: string,
  actorId: string,
) {
  const marked = await tx.inventoryMovement.findMany({
    where: { requestId: DEMO_INITIAL_STOCK_MARKER, warehouseId },
    include: { product: { select: { code: true } } },
  });
  for (const code of DEMO_ZERO_START)
    if (marked.some((m) => m.product.code === code))
      drift('Initial stock ' + code, 'debe iniciar en cero');
  const lines = [];
  for (const spec of DEMO_INITIAL_STOCK) {
    const rows = marked.filter((m) => m.product.code === spec.productCode);
    if (rows.length > 1) drift('Initial stock ' + spec.productCode, 'carga inicial duplicada');
    if (rows.length === 1) {
      assertSame(
        'Initial stock ' + spec.productCode,
        { quantity: dec(rows[0].quantity) },
        {
          quantity: dec(spec.quantity),
        },
      );
      continue;
    }
    lines.push({
      type: InventoryMovementType.ADJUSTMENT_IN,
      productId: id(ids, spec.productCode),
      warehouseId,
      quantity: spec.quantity,
      origin: { kind: 'ADJUSTMENT' as const, reason: 'INITIAL_LOAD' as const },
    });
  }
  if (!lines.length) return;
  const movements = await new InventoryService().applyMovements(tx, {
    performedByUserId: actorId,
    requestId: DEMO_INITIAL_STOCK_MARKER,
    lines,
  });
  const audit = new AuditService();
  for (const movement of movements) {
    stats.created.INITIAL_STOCK = (stats.created.INITIAL_STOCK ?? 0) + 1;
    await audit.record(tx, {
      actor: { type: ActorType.USER, userId: actorId },
      action: AuditAction.ADJUST_STOCK,
      entity: { type: AuditEntityType.INVENTORY_MOVEMENT, id: movement.id },
      requestId: DEMO_INITIAL_STOCK_MARKER,
      newValues: {
        productId: movement.productId,
        warehouseId,
        lotId: null,
        quantity: movement.quantity.toString(),
        reason: 'INITIAL_LOAD',
      },
    });
  }
}
