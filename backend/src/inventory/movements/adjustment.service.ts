import { Injectable } from '@nestjs/common';

import { AuditService } from '../../audit/audit.service.js';
import { currentRequestContext } from '../../common/request-context/request-context.js';
import { ActorType, AuditAction, AuditEntityType } from '../../generated/prisma/client.js';
import type { AuthenticatedUser } from '../../auth/access-policy.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto.js';
import { InventoryService } from './inventory.service.js';

@Injectable()
export class AdjustmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: AuthenticatedUser, dto: CreateAdjustmentDto) {
    const requestId = currentRequestContext()?.requestId;

    return this.prisma.$transaction(async (tx) => {
      const [movement] = await this.inventory.applyMovements(tx, {
        performedByUserId: actor.id,
        requestId,
        lines: [
          {
            productId: dto.productId,
            warehouseId: dto.warehouseId,
            ...(dto.lotId ? { lotId: dto.lotId } : {}),
            type: dto.type,
            quantity: dto.quantity,
            origin: { kind: 'ADJUSTMENT', reason: dto.reason },
          },
        ],
      });

      await this.audit.record(tx, {
        actor: { type: ActorType.USER, userId: actor.id },
        action: AuditAction.ADJUST_STOCK,
        entity: { type: AuditEntityType.INVENTORY_MOVEMENT, id: movement.id },
        requestId,
        newValues: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          lotId: dto.lotId ?? null,
          type: dto.type,
          quantity: movement.quantity.toString(),
          reason: dto.reason,
        },
      });

      return movement;
    });
  }
}
