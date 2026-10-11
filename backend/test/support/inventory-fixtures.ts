import { randomUUID } from 'node:crypto';

import { LotStatus, ProductType, UnitOfMeasure } from '../../src/generated/prisma/client.js';
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
  prisma: PrismaService,
  productId: string,
  status: LotStatus = LotStatus.RELEASED,
) {
  return prisma.lot.create({
    data: {
      code: `LOT-INV-${suffix()}`,
      productId,
      status,
      originatedAt: new Date(),
    },
  });
}
