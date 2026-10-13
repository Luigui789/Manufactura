import { Injectable, NotFoundException } from '@nestjs/common';

import { LotStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StockQueryDto } from './dto/stock-query.dto.js';

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

  async list(query: StockQueryDto) {
    const { page, limit, productId, warehouseId, productType, search, hasStock } = query;

    const where: Prisma.StockBalanceWhereInput = {
      ...(productId ? { productId } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(hasStock === true ? { quantity: { gt: new Prisma.Decimal(0) } } : {}),
      ...(productType || search
        ? {
            product: {
              is: {
                ...(productType ? { type: productType } : {}),
                ...(search
                  ? {
                      OR: [
                        { code: { contains: search, mode: 'insensitive' } },
                        { name: { contains: search, mode: 'insensitive' } },
                      ],
                    }
                  : {}),
              },
            },
          }
        : {}),
    };

    // Existencia física: incluye lotes de cualquier estado. La disponibilidad
    // consumible sigue siendo un contrato distinto en getConsumableQuantity.
    // Página y total se consultan en PostgreSQL sobre la misma instantánea.
    const [balances, total] = await this.prisma.$transaction(
      [
        this.prisma.stockBalance.findMany({
          where,
          orderBy: [
            { product: { name: 'asc' } },
            { warehouse: { name: 'asc' } },
            { productId: 'asc' },
            { warehouseId: 'asc' },
          ],
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            quantity: true,
            updatedAt: true,
            product: {
              select: {
                id: true,
                code: true,
                name: true,
                type: true,
                unit: true,
                isLotTracked: true,
              },
            },
            warehouse: {
              select: { id: true, code: true, name: true },
            },
          },
        }),
        this.prisma.stockBalance.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const data = balances.map((balance) => ({
      ...balance,
      quantity: balance.quantity.toFixed(4),
    }));

    return {
      data,
      meta: { page, limit, total },
    };
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
