import { Injectable, NotFoundException } from '@nestjs/common';

import { LotStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Consultas informativas; las escrituras deben validar otra vez bajo bloqueo. */
@Injectable()
export class StockQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Physical on-hand quantity, including tracked lots in every status. */
  async getOnHandQuantity(productId: string, warehouseId: string): Promise<Prisma.Decimal> {
    await this.assertReferencesExist(productId, warehouseId);

    const balance = await this.prisma.stockBalance.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
      select: { quantity: true },
    });
    return balance?.quantity ?? new Prisma.Decimal(0);
  }

  /** Quantity available for consumption; tracked products include only RELEASED lots. */
  async getConsumableQuantity(productId: string, warehouseId: string): Promise<Prisma.Decimal> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, isLotTracked: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    await this.assertWarehouseExists(warehouseId);

    if (!product.isLotTracked) {
      return this.getOnHandQuantity(productId, warehouseId);
    }

    const releasedLotLedger = await this.prisma.inventoryMovement.aggregate({
      where: {
        productId,
        warehouseId,
        lot: { is: { status: LotStatus.RELEASED } },
      },
      _sum: { quantity: true },
    });
    return releasedLotLedger._sum.quantity ?? new Prisma.Decimal(0);
  }

  private async assertReferencesExist(productId: string, warehouseId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    await this.assertWarehouseExists(warehouseId);
  }

  private async assertWarehouseExists(warehouseId: string): Promise<void> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true },
    });
    if (!warehouse) throw new NotFoundException('Almacén no encontrado');
  }
}
