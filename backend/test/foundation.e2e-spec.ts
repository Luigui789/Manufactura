import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  PrismaClient,
  RoleCode,
} from '../src/generated/prisma/client.js';
import { applyAdjustment } from '../src/inventory/apply-adjustment.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('Las pruebas Foundation requieren una DATABASE_URL de base dedicada *_test');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const suffix = randomUUID().slice(0, 8);

let userId: string;
let productId: string;
let otherProductId: string;
let lotId: string;
let warehouseId: string;
let movementId: string;
let auditLogId: string;

beforeAll(async () => {
  const admin = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ADMIN } });
  const warehouse = await prisma.warehouse.findUniqueOrThrow({
    where: { code: 'ALM-PRINCIPAL' },
  });
  warehouseId = warehouse.id;
  const user = await prisma.user.create({
    data: {
      email: `foundation-${suffix}@example.test`,
      passwordHash: 'test-hash-not-a-real-password',
      fullName: 'Foundation Test',
      roleId: admin.id,
    },
  });
  userId = user.id;
  const product = await prisma.product.create({
    data: {
      code: `TEST-${suffix}`,
      name: 'Producto de prueba',
      category: 'Aceites recuperados',
      type: 'RAW_MATERIAL',
      unit: 'KILOGRAM',
    },
  });
  productId = product.id;
  const otherProduct = await prisma.product.create({
    data: {
      code: `OTHER-${suffix}`,
      name: 'Otro producto de prueba',
      category: 'Materias primas',
      type: 'RAW_MATERIAL',
      unit: 'KILOGRAM',
      isLotTracked: true,
    },
  });
  otherProductId = otherProduct.id;
  const lot = await prisma.lot.create({
    data: {
      code: `LOT-TEST-${suffix}`,
      productId: otherProductId,
      status: 'QUARANTINED',
      originatedAt: new Date(),
    },
  });
  lotId = lot.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Foundation: restricciones reales de PostgreSQL', () => {
  it('persiste categoría y ubicación obligatorias con límites de longitud', async () => {
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });
    expect(product.category).toBe('Aceites recuperados');
    expect(product.type).toBe('RAW_MATERIAL');
    expect(warehouse.location).toBe('Planta principal - Managua');

    await expect(
      prisma.product.create({
        data: {
          code: `LONG-${suffix}`,
          name: 'Categoría demasiado larga',
          category: 'x'.repeat(101),
          type: 'RAW_MATERIAL',
          unit: 'KILOGRAM',
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.warehouse.create({
        data: {
          code: `LONG-${suffix}`,
          name: 'Ubicación demasiado larga',
          location: 'x'.repeat(256),
        },
      }),
    ).rejects.toThrow();
  });

  it('rechaza cantidad cero y signos incompatibles', async () => {
    for (const [type, quantity] of [
      ['ADJUSTMENT_IN', 0],
      ['ADJUSTMENT_IN', -1],
      ['ADJUSTMENT_OUT', 1],
    ] as const) {
      await expect(
        prisma.inventoryMovement.create({
          data: {
            productId,
            warehouseId,
            type,
            quantity,
            reason: 'PHYSICAL_COUNT',
            performedByUserId: userId,
          },
        }),
      ).rejects.toThrow();
    }
  });

  it('rechaza ajustes sin motivo', async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO inventory_movements
        (id, product_id, warehouse_id, type, quantity, performed_by_user_id)
        VALUES (${randomUUID()}::uuid, ${productId}::uuid, ${warehouseId}::uuid,
          'ADJUSTMENT_IN', 1, ${userId}::uuid)`,
    ).rejects.toThrow();
  });

  it('rechaza saldo negativo y lote de otro producto', async () => {
    await expect(
      prisma.stockBalance.create({
        data: { productId, warehouseId, quantity: -1 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.inventoryMovement.create({
        data: {
          productId,
          warehouseId,
          lotId,
          type: 'ADJUSTMENT_IN',
          quantity: 1,
          reason: 'INITIAL_LOAD',
          performedByUserId: userId,
        },
      }),
    ).rejects.toThrow();
  });

  it('valida en backend que el lote pertenece al producto', async () => {
    await expect(
      applyAdjustment(prisma, {
        productId: otherProductId,
        warehouseId,
        lotId: randomUUID(),
        type: 'ADJUSTMENT_IN',
        quantity: '1',
        reason: 'INITIAL_LOAD',
        performedByUserId: userId,
      }),
    ).rejects.toThrow('El lote no pertenece al producto del ajuste');
  });

  it('rechaza combinaciones inválidas de actor, acción y entidad', async () => {
    await expect(
      prisma.auditLog.create({
        data: {
          actorType: ActorType.USER,
          actorUserId: userId,
          action: AuditAction.LOGIN_FAILED,
          entityType: AuditEntityType.USER,
          entityId: userId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.auditLog.create({
        data: {
          actorType: ActorType.ANONYMOUS,
          action: AuditAction.LOGIN,
          entityType: AuditEntityType.USER,
          entityId: userId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.auditLog.create({
        data: {
          actorType: ActorType.USER,
          actorUserId: userId,
          action: AuditAction.LOGIN,
          entityType: AuditEntityType.USER,
          entityId: otherProductId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.auditLog.create({
        data: {
          actorType: ActorType.SYSTEM,
          action: AuditAction.CREATE,
        },
      }),
    ).rejects.toThrow();
  });

  it('admite las tres semánticas correctas de LOGIN y LOGIN_FAILED', async () => {
    const targetKnown = await prisma.auditLog.create({
      data: {
        actorType: ActorType.ANONYMOUS,
        action: AuditAction.LOGIN_FAILED,
        entityType: AuditEntityType.USER,
        entityId: userId,
      },
    });
    expect(targetKnown.actorUserId).toBeNull();
    const targetUnknown = await prisma.auditLog.create({
      data: { actorType: ActorType.ANONYMOUS, action: AuditAction.LOGIN_FAILED },
    });
    expect(targetUnknown.entityId).toBeNull();
    const login = await prisma.auditLog.create({
      data: {
        actorType: ActorType.USER,
        actorUserId: userId,
        action: AuditAction.LOGIN,
        entityType: AuditEntityType.USER,
        entityId: userId,
      },
    });
    expect(login.actorUserId).toBe(login.entityId);
  });

  it('rechaza duplicados en códigos y pares únicos', async () => {
    await expect(
      prisma.product.create({
        data: {
          code: `TEST-${suffix}`,
          name: 'Duplicado',
          category: 'Aceites recuperados',
          type: 'RAW_MATERIAL',
          unit: 'KILOGRAM',
        },
      }),
    ).rejects.toThrow();
    const testYear = 2000 + (Number.parseInt(suffix, 16) % 7000);
    await prisma.documentSequence.create({
      data: { documentType: 'LOT', year: testYear, lastNumber: 0 },
    });
    await expect(
      prisma.documentSequence.create({
        data: { documentType: 'LOT', year: testYear, lastNumber: 1 },
      }),
    ).rejects.toThrow();
  });
});

describe('Foundation: transacción, ledger y auditoría', () => {
  it('ajusta existencias, reconcilia el ledger y revierte una salida insuficiente', async () => {
    const input = {
      productId,
      warehouseId,
      performedByUserId: userId,
      reason: 'PHYSICAL_COUNT' as const,
      requestId: `foundation-${suffix}`,
    };
    const incoming = await applyAdjustment(prisma, {
      ...input,
      type: 'ADJUSTMENT_IN',
      quantity: '7.2500',
    });
    movementId = incoming.id;
    const outgoing = await applyAdjustment(prisma, {
      ...input,
      type: 'ADJUSTMENT_OUT',
      quantity: '2.1250',
    });
    const balance = await prisma.stockBalance.findUniqueOrThrow({
      where: { productId_warehouseId: { productId, warehouseId } },
    });
    const ledger = await prisma.inventoryMovement.aggregate({
      where: { productId, warehouseId },
      _sum: { quantity: true },
    });
    expect(balance.quantity.toString()).toBe('5.125');
    expect(balance.quantity.equals(ledger._sum.quantity ?? 0)).toBe(true);
    expect(outgoing.quantity.isNegative()).toBe(true);
    const audit = await prisma.auditLog.findMany({
      where: { requestId: input.requestId, action: AuditAction.ADJUST_STOCK },
    });
    expect(audit).toHaveLength(2);
    auditLogId = audit[0].id;

    await expect(
      applyAdjustment(prisma, { ...input, type: 'ADJUSTMENT_OUT', quantity: '99' }),
    ).rejects.toThrow('Existencia general insuficiente');
    expect(await prisma.inventoryMovement.count({ where: { requestId: input.requestId } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { requestId: input.requestId } })).toBe(2);
  });

  it('rechaza UPDATE y DELETE del ledger y de AuditLog', async () => {
    await expect(
      prisma.inventoryMovement.update({
        where: { id: movementId },
        data: { quantity: 99 },
      }),
    ).rejects.toThrow();
    await expect(prisma.inventoryMovement.delete({ where: { id: movementId } })).rejects.toThrow();
    await expect(
      prisma.auditLog.update({
        where: { id: auditLogId },
        data: { requestId: 'alterado' },
      }),
    ).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: auditLogId } })).rejects.toThrow();
  });

  it('serializa ajustes concurrentes y evita dos salidas sobre el mismo saldo', async () => {
    const raceProduct = await prisma.product.create({
      data: {
        code: `RACE-${suffix}`,
        name: 'Producto de concurrencia',
        category: 'Materias primas',
        type: 'RAW_MATERIAL',
        unit: 'KILOGRAM',
      },
    });
    const input = {
      productId: raceProduct.id,
      warehouseId,
      performedByUserId: userId,
      reason: 'PHYSICAL_COUNT' as const,
    };
    const incoming = await Promise.allSettled([
      applyAdjustment(prisma, { ...input, type: 'ADJUSTMENT_IN', quantity: '1' }),
      applyAdjustment(prisma, { ...input, type: 'ADJUSTMENT_IN', quantity: '1' }),
    ]);
    expect(incoming.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);

    const outgoing = await Promise.allSettled([
      applyAdjustment(prisma, { ...input, type: 'ADJUSTMENT_OUT', quantity: '2' }),
      applyAdjustment(prisma, { ...input, type: 'ADJUSTMENT_OUT', quantity: '2' }),
    ]);
    expect(outgoing.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const balance = await prisma.stockBalance.findUniqueOrThrow({
      where: { productId_warehouseId: { productId: raceProduct.id, warehouseId } },
    });
    expect(balance.quantity.isZero()).toBe(true);
    const ledger = await prisma.inventoryMovement.aggregate({
      where: { productId: raceProduct.id, warehouseId },
      _sum: { quantity: true },
    });
    expect(balance.quantity.equals(ledger._sum.quantity ?? 0)).toBe(true);
  });
});
