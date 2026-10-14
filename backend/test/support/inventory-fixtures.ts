import { randomUUID } from 'node:crypto';

import { LotStatus, ProductType, UnitOfMeasure } from '../../src/generated/prisma/client.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';

function suffix(): string {
  return randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
}

export async function createInventoryProduct(
  prisma: PrismaService,
  options: { isLotTracked?: boolean } = {},
) {
  const code = suffix();
  return prisma.product.create({
    data: {
      code: `INV-${code}`,
      name: `Producto de prueba ${code}`,
      category: 'Pruebas',
      type: ProductType.RAW_MATERIAL,
      unit: UnitOfMeasure.KILOGRAM,
      isLotTracked: options.isLotTracked ?? false,
    },
  });
}

export async function createInventoryWarehouse(prisma: PrismaService) {
  const code = suffix();
  return prisma.warehouse.create({
    data: {
      code: `INV-${code}`,
      name: `Almacén de prueba ${code}`,
      location: 'Zona de pruebas',
    },
  });
}

export async function createInventoryLot(
  prisma: PrismaService | PrismaClient,
  productId: string,
  status: LotStatus = LotStatus.RELEASED,
) {
  // Fixture origins model the physical purchase FK; no inventory is manufactured here.
  const actor = await prisma.user.findFirstOrThrow();
  const supplier = await prisma.supplier.create({
    data: { code: `FIX-${suffix()}`, name: 'Fixture origin' },
  });
  const order = await prisma.purchaseOrder.create({
    data: {
      number: `OC-FIX-${suffix()}`,
      supplierId: supplier.id,
      orderedAt: new Date(),
      createdByUserId: actor.id,
      status: 'CONFIRMED',
      items: { create: { productId, quantityOrdered: '1', unitPrice: '0', lineTotal: '0' } },
    },
    include: { items: true },
  });
  const warehouse = await prisma.warehouse.findFirstOrThrow();
  const receipt = await prisma.purchaseReceipt.create({
    data: {
      number: `REC-FIX-${suffix()}`,
      purchaseOrderId: order.id,
      receivedAt: new Date(),
      receivedByUserId: actor.id,
      items: {
        create: {
          purchaseOrderItemId: order.items[0].id,
          productId,
          warehouseId: warehouse.id,
          quantity: '1',
        },
      },
    },
    include: { items: true },
  });
  return prisma.lot.create({
    data: {
      code: `LOT-INV-${suffix()}`,
      productId,
      status,
      originatedAt: new Date(),
      purchaseReceiptItemId: receipt.items[0].id,
    },
  });
}
