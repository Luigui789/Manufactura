import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/access-policy.js';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  LotStatus,
  QualityResult,
} from '../../generated/prisma/client.js';
import { InventoryService } from '../../inventory/movements/inventory.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { InspectionDto } from './inspection.dto.js';

@Injectable()
export class QualityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  async get(lotId: string) {
    if (!(await this.prisma.lot.findUnique({ where: { id: lotId }, select: { id: true } })))
      throw new NotFoundException('Lote no encontrado');
    return this.prisma.qualityInspection.findUnique({
      where: { lotId },
      include: { inspectedBy: { select: { id: true, fullName: true } } },
    });
  }

  async inspect(actor: AuthenticatedUser, lotId: string, dto: InspectionDto) {
    if (dto.result === QualityResult.REJECTED && !dto.nonConformities?.trim())
      throw new UnprocessableEntityException('Describe las no conformidades del rechazo');
    return this.prisma.$transaction(
      async (tx) => {
        const origin = await tx.lot.findUnique({
          where: { id: lotId },
          select: { productionOrderId: true },
        });
        if (!origin) throw new NotFoundException('Lote no encontrado');
        if (!origin.productionOrderId)
          throw new UnprocessableEntityException('Esta inspección solo admite lotes producidos');
        await tx.$queryRaw`SELECT id FROM production_orders WHERE id = ${origin.productionOrderId}::uuid FOR UPDATE`;
        if (await tx.qualityInspection.findUnique({ where: { lotId } }))
          throw new ConflictException('El lote ya tiene una inspección; no se admite reinspección');
        const status =
          dto.result === QualityResult.APPROVED ? LotStatus.RELEASED : LotStatus.REJECTED;
        await this.inventory.inspectProducedLot(tx, lotId, status);
        const inspection = await tx.qualityInspection.create({
          data: {
            lotId,
            result: dto.result,
            observations: dto.observations,
            nonConformities: dto.nonConformities,
            inspectedByUserId: actor.id,
          },
          include: { inspectedBy: { select: { id: true, fullName: true } } },
        });
        await this.audit.record(tx, {
          actor: { type: ActorType.USER, userId: actor.id },
          action:
            dto.result === QualityResult.APPROVED
              ? AuditAction.QUALITY_APPROVE
              : AuditAction.QUALITY_REJECT,
          entity: { type: AuditEntityType.QUALITY_INSPECTION, id: inspection.id },
          newValues: {
            lotId,
            result: inspection.result,
            observations: inspection.observations,
            nonConformities: inspection.nonConformities,
            inspectedAt: inspection.inspectedAt.toISOString(),
            inspectedByUserId: actor.id,
            lotStatus: status,
          },
        });
        return inspection;
      },
      { timeout: 15000 },
    );
  }
}
