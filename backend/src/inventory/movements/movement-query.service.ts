import { BadRequestException, Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { MovementsQueryDto } from './dto/movements-query.dto.js';

@Injectable()
export class MovementQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: MovementsQueryDto) {
    const { page, limit, productId, warehouseId, lotId, type, from, to } = query;
    const start = from ? new Date(from) : undefined;
    const end = to ? new Date(to) : undefined;

    if (start && end && start > end) {
      throw new BadRequestException('from no puede ser posterior a to');
    }

    const occurredAt: Prisma.DateTimeFilter = {
      ...(start ? { gte: start } : {}),
      ...(end ? { lte: end } : {}),
    };
    const where: Prisma.InventoryMovementWhereInput = {
      ...(productId ? { productId } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(lotId ? { lotId } : {}),
      ...(type ? { type } : {}),
      ...(start || end ? { occurredAt } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          quantity: true,
          reason: true,
          occurredAt: true,
          requestId: true,
          product: { select: { id: true, code: true, name: true, unit: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          lot: { select: { id: true, code: true, status: true } },
          performedByUser: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return {
      data: data.map((movement) => ({
        ...movement,
        quantity: movement.quantity.toFixed(4),
      })),
      meta: { page, limit, total },
    };
  }
}
