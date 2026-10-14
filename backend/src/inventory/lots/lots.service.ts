import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  purchaseOriginSelect,
  purchaseOrigin,
  purchaseBusinessReference,
} from '../purchase-origin.js';
import type { LotsQueryDto } from './dto/lots-query.dto.js';

type LotLedgerGroup = {
  lotId: string | null;
  warehouseId: string;
  _sum: { quantity: Prisma.Decimal | null };
};

@Injectable()
export class LotsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: LotsQueryDto) {
    const { page, limit, productId, status, search, warehouseId, hasStock } = query;
    const movementWhere: Prisma.InventoryMovementWhereInput = {
      lotId: { not: null },
      ...(warehouseId ? { warehouseId } : {}),
    };
    const grouped = await this.prisma.inventoryMovement.groupBy({
      by: ['lotId', 'warehouseId'],
      where: movementWhere,
      _sum: { quantity: true },
    });
    const balances = this.ledgerBalances(grouped);
    const availableIds = new Set(
      balances.filter((entry) => entry.quantity.gt(0)).map((entry) => entry.lotId),
    );
    const where: Prisma.LotWhereInput = {
      ...(productId ? { productId } : {}),
      ...(status ? { status } : {}),
      ...(warehouseId ? { movements: { some: { warehouseId } } } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { product: { is: { code: { contains: search, mode: 'insensitive' } } } },
              { product: { is: { name: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
      ...(hasStock === true ? { id: { in: [...availableIds] } } : {}),
      ...(hasStock === false ? { id: { notIn: [...availableIds] } } : {}),
    };
    const [lots, total] = await this.prisma.$transaction([
      this.prisma.lot.findMany({
        where,
        orderBy: [{ originatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          code: true,
          status: true,
          originatedAt: true,
          expiresAt: true,
          purchaseReceiptItemId: true,
          purchaseReceiptItem: { select: purchaseOriginSelect },
          product: { select: { id: true, code: true, name: true, unit: true } },
        },
      }),
      this.prisma.lot.count({ where }),
    ]);
    const byLot = new Map<string, Array<{ warehouseId: string; quantity: Prisma.Decimal }>>();
    for (const entry of balances) {
      const list = byLot.get(entry.lotId) ?? [];
      list.push({ warehouseId: entry.warehouseId, quantity: entry.quantity });
      byLot.set(entry.lotId, list);
    }
    return {
      data: lots.map(({ purchaseReceiptItem, purchaseReceiptItemId, ...lot }) => ({
        ...lot,
        expiresAt: lot.expiresAt?.toISOString().slice(0, 10) ?? null,
        origin: purchaseOrigin(purchaseReceiptItem, purchaseReceiptItemId),
        quantityOnHand: (byLot.get(lot.id) ?? [])
          .reduce((total, entry) => total.add(entry.quantity), new Prisma.Decimal(0))
          .toFixed(4),
      })),
      meta: { page, limit, total },
    };
  }

  async get(id: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        status: true,
        originatedAt: true,
        expiresAt: true,
        purchaseReceiptItemId: true,
        purchaseReceiptItem: { select: purchaseOriginSelect },
        product: { select: { id: true, code: true, name: true, unit: true } },
        movements: {
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            type: true,
            quantity: true,
            reason: true,
            occurredAt: true,
            requestId: true,
            purchaseReceiptItemId: true,
            purchaseReceiptItem: { select: purchaseOriginSelect },
            warehouse: { select: { id: true, code: true, name: true } },
            performedByUser: { select: { id: true, fullName: true } },
          },
        },
      },
    });
    if (!lot) throw new NotFoundException('Lote no encontrado');

    const grouped = await this.prisma.inventoryMovement.groupBy({
      by: ['warehouseId'],
      where: { lotId: id },
      _sum: { quantity: true },
    });
    const warehouses = await this.prisma.warehouse.findMany({
      where: { id: { in: grouped.map((entry) => entry.warehouseId) } },
      select: { id: true, code: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
    const balances = grouped.flatMap((entry) => {
      const warehouse = warehouseById.get(entry.warehouseId);
      if (!warehouse) return [];
      return [
        {
          warehouse,
          quantity: (entry._sum.quantity ?? new Prisma.Decimal(0)).toFixed(4),
        },
      ];
    });

    const { purchaseReceiptItem, purchaseReceiptItemId, ...details } = lot;
    return {
      ...details,
      expiresAt: lot.expiresAt?.toISOString().slice(0, 10) ?? null,
      origin: purchaseOrigin(purchaseReceiptItem, purchaseReceiptItemId),
      balances,
      movements: lot.movements.map(({ purchaseReceiptItem, ...movement }) => ({
        ...movement,
        quantity: movement.quantity.toFixed(4),
        businessReference: purchaseBusinessReference(
          purchaseReceiptItem,
          movement.purchaseReceiptItemId,
        ),
      })),
    };
  }

  private ledgerBalances(groups: LotLedgerGroup[]) {
    const balances = new Map<
      string,
      { lotId: string; warehouseId: string; quantity: Prisma.Decimal }
    >();
    for (const group of groups) {
      if (!group.lotId) continue;
      balances.set(`${group.lotId}:${group.warehouseId}`, {
        lotId: group.lotId,
        warehouseId: group.warehouseId,
        quantity: group._sum.quantity ?? new Prisma.Decimal(0),
      });
    }
    return [...balances.values()];
  }
}
