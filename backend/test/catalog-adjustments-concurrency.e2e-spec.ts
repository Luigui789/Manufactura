import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ConflictException } from '@nestjs/common';

import { AuditService } from '../src/audit/audit.service.js';
import type { AuthenticatedUser } from '../src/auth/access-policy.js';
import { AuditAction, AuditEntityType, Prisma, RoleCode } from '../src/generated/prisma/client.js';
import { applyAdjustment } from '../src/inventory/apply-adjustment.js';
import { ProductsService } from '../src/inventory/products/products.service.js';
import { WarehousesService } from '../src/inventory/warehouses/warehouses.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, type TestApp } from './support/auth-test-kit.js';

let kit: TestApp;
let actor: AuthenticatedUser;
let audit: AuditService;

beforeAll(async () => {
  kit = await createTestApp();
  const user = await createUser(kit, RoleCode.INVENTARIO);
  actor = {
    id: user.id,
    email: user.email,
    fullName: 'Prueba INVENTARIO',
    role: user.role,
    mustChangePassword: false,
  };
  audit = kit.app.get(AuditService);
});

afterAll(async () => {
  if (kit) await kit.close();
});

const changes = ['disable-product', 'disable-warehouse', 'unit', 'type'] as const;
type Change = (typeof changes)[number];

async function fixture() {
  const product = await kit.prisma.product.create({
    data: {
      code: `RACE-${randomUUID()}`.toUpperCase(),
      name: 'Producto de concurrencia con ajustes',
      category: 'Pruebas',
      type: 'RAW_MATERIAL',
      unit: 'LITER',
    },
  });
  const warehouse = await kit.prisma.warehouse.create({
    data: {
      code: `RACE-${randomUUID()}`.toUpperCase(),
      name: 'Almacén de concurrencia con ajustes',
      location: 'Zona de pruebas',
    },
  });
  return { product, warehouse };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function adjust(prisma: PrismaService, { product, warehouse }: Fixture) {
  return applyAdjustment(prisma, {
    productId: product.id,
    warehouseId: warehouse.id,
    type: 'ADJUSTMENT_IN',
    quantity: '5',
    reason: 'INITIAL_LOAD',
    performedByUserId: actor.id,
  });
}

function changeCatalog(prisma: PrismaService, change: Change, { product, warehouse }: Fixture) {
  if (change === 'disable-warehouse') {
    return new WarehousesService(prisma, audit).setStatus(actor, warehouse.id, false);
  }

  const service = new ProductsService(prisma, audit);
  if (change === 'disable-product') return service.setStatus(actor, product.id, false);
  return service.update(
    actor,
    product.id,
    change === 'unit' ? { unit: 'KILOGRAM' } : { type: 'INTERMEDIATE' },
  );
}

// Ejecuta el servicio real dentro de una transacción que la prueba controla.
// No reemplaza consultas, resultados ni escrituras de PostgreSQL.
function transactionClient(tx: Prisma.TransactionClient): PrismaService {
  return {
    $transaction: <T>(callback: (client: Prisma.TransactionClient) => Promise<T>) => callback(tx),
  } as unknown as PrismaService;
}

async function firstCommitsBeforeSecond(
  first: (prisma: PrismaService) => Promise<unknown>,
  second: () => Promise<unknown>,
) {
  const competing: {
    settled: boolean;
    outcome?: Promise<PromiseSettledResult<unknown>>;
  } = { settled: false };

  try {
    await kit.prisma.$transaction(
      async (tx) => {
        const [{ pid }] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        await first(transactionClient(tx));

        competing.outcome = second().then(
          (value): PromiseFulfilledResult<unknown> => {
            competing.settled = true;
            return { status: 'fulfilled', value };
          },
          (reason: unknown): PromiseRejectedResult => {
            competing.settled = true;
            return { status: 'rejected', reason };
          },
        );

        // Espera un bloqueo real, sin depender de sleeps ni del orden del scheduler.
        await expect
          .poll(
            async () => {
              if (competing.settled) return 'completed';
              const [{ blocked }] = await kit.prisma.$queryRaw<Array<{ blocked: boolean }>>`
                SELECT EXISTS (
                  SELECT 1 FROM pg_stat_activity
                  WHERE datname = current_database()
                    AND ${pid}::integer = ANY(pg_blocking_pids(pid))
                ) AS blocked
              `;
              return blocked ? 'blocked' : 'running';
            },
            { timeout: 2000, interval: 10 },
          )
          .toBe('blocked');
      },
      { timeout: 10000 },
    );

    if (!competing.outcome) throw new Error('No se inició la operación concurrente');
    return await competing.outcome;
  } finally {
    // También espera al contendiente cuando la aserción revierte la primera transacción.
    if (competing.outcome) await competing.outcome;
  }
}

async function expectStock(
  { product, warehouse }: Fixture,
  quantity: string,
  movementCount: number,
) {
  const balance = await kit.prisma.stockBalance.findUnique({
    where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
  });
  const ledger = await kit.prisma.inventoryMovement.aggregate({
    where: { productId: product.id, warehouseId: warehouse.id },
    _sum: { quantity: true },
    _count: true,
  });
  expect(balance?.quantity.toString() ?? '0').toBe(quantity);
  expect(ledger._sum.quantity?.toString() ?? '0').toBe(quantity);
  expect(ledger._count).toBe(movementCount);
  expect(
    await kit.prisma.auditLog.count({
      where: {
        entityType: AuditEntityType.INVENTORY_MOVEMENT,
        entityId: {
          in: (
            await kit.prisma.inventoryMovement.findMany({
              where: { productId: product.id },
              select: { id: true },
            })
          ).map(({ id }) => id),
        },
        action: AuditAction.ADJUST_STOCK,
      },
    }),
  ).toBe(movementCount);
}

describe('Catálogos y ajustes: serialización en ambos órdenes', () => {
  it.each(changes)(
    'si el ajuste confirma primero, %s se rechaza sin cambiar el catálogo',
    async (change) => {
      const items = await fixture();
      const outcome = await firstCommitsBeforeSecond(
        (prisma) => adjust(prisma, items),
        () => changeCatalog(kit.prisma, change, items),
      );

      expect(outcome.status).toBe('rejected');
      if (outcome.status !== 'rejected') throw new Error('El catálogo no rechazó el cambio');
      expect(outcome.reason).toBeInstanceOf(ConflictException);
      expect(
        await kit.prisma.product.findUniqueOrThrow({ where: { id: items.product.id } }),
      ).toMatchObject({
        isActive: true,
        unit: 'LITER',
        type: 'RAW_MATERIAL',
      });
      expect(
        await kit.prisma.warehouse.findUniqueOrThrow({ where: { id: items.warehouse.id } }),
      ).toMatchObject({ isActive: true });
      expect(
        await kit.prisma.auditLog.count({
          where: { entityId: { in: [items.product.id, items.warehouse.id] } },
        }),
      ).toBe(0);
      await expectStock(items, '5', 1);
    },
  );

  it.each(changes)(
    'si %s confirma primero, el ajuste espera y valida el catálogo actualizado',
    async (change) => {
      const items = await fixture();
      const outcome = await firstCommitsBeforeSecond(
        (prisma) => changeCatalog(prisma, change, items),
        () => adjust(kit.prisma, items),
      );

      const disabled = change === 'disable-product' || change === 'disable-warehouse';
      if (disabled) {
        expect(outcome.status).toBe('rejected');
        if (outcome.status !== 'rejected')
          throw new Error('El ajuste no rechazó el catálogo inactivo');
        expect(outcome.reason).toBeInstanceOf(Error);
        expect((outcome.reason as Error).message).toBe(
          'Producto, almacén y usuario activos son obligatorios',
        );
      } else {
        expect(outcome.status).toBe('fulfilled');
      }

      expect(
        await kit.prisma.product.findUniqueOrThrow({ where: { id: items.product.id } }),
      ).toMatchObject({
        isActive: change !== 'disable-product',
        unit: change === 'unit' ? 'KILOGRAM' : 'LITER',
        type: change === 'type' ? 'INTERMEDIATE' : 'RAW_MATERIAL',
      });
      expect(
        await kit.prisma.warehouse.findUniqueOrThrow({ where: { id: items.warehouse.id } }),
      ).toMatchObject({
        isActive: change !== 'disable-warehouse',
      });
      expect(
        await kit.prisma.auditLog.count({
          where: { entityId: { in: [items.product.id, items.warehouse.id] } },
        }),
      ).toBe(1);
      await expectStock(items, disabled ? '0' : '5', disabled ? 0 : 1);
    },
  );
});
