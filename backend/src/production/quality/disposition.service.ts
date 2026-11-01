import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/access-policy.js';
import { currentRequestContext } from '../../common/request-context/request-context.js';
import { ActorType, AuditAction, AuditEntityType } from '../../generated/prisma/client.js';
import { InventoryService } from '../../inventory/movements/inventory.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { DispositionDto } from './disposition.dto.js';
const include = { decidedBy: { select: { id: true, fullName: true } } } as const;
@Injectable()
export class DispositionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}
  async get(lotId: string) {
    if (!(await this.prisma.lot.findUnique({ where: { id: lotId }, select: { id: true } })))
      throw new NotFoundException('Lote no encontrado');
    return this.prisma.qualityDisposition.findUnique({ where: { lotId }, include });
  }
  async create(actor: AuthenticatedUser, lotId: string, dto: DispositionDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const origin = await tx.lot.findUnique({
          where: { id: lotId },
          select: { productionOrderId: true },
        });
        if (!origin) throw new NotFoundException('Lote no encontrado');
        if (!origin.productionOrderId)
          throw new UnprocessableEntityException('La disposición solo admite lotes producidos');
        await tx.$queryRaw`SELECT id FROM production_orders WHERE id = ${origin.productionOrderId}::uuid FOR UPDATE`;
        if (await tx.qualityDisposition.findUnique({ where: { lotId } }))
          throw new ConflictException('El lote ya tiene una disposición inmutable');
        const inspection = await tx.qualityInspection.findUnique({ where: { lotId } });
        if (!inspection || inspection.result !== 'REJECTED')
          throw new UnprocessableEntityException('Se requiere una inspección rechazada');
        const result = await this.inventory.applyQualityDisposition(
          tx,
          lotId,
          dto.type,
          actor.id,
          currentRequestContext()?.requestId,
        );
        const disposition = await tx.qualityDisposition.create({
          data: {
            lotId,
            inspectionId: inspection.id,
            type: dto.type,
            reason: dto.reason,
            decidedByUserId: actor.id,
          },
          include,
        });
        const action = {
          RELEASE: AuditAction.QUALITY_DISPOSITION_RELEASE,
          REWORK: AuditAction.QUALITY_DISPOSITION_REWORK,
          SCRAP: AuditAction.QUALITY_DISPOSITION_SCRAP,
        }[dto.type];
        await this.audit.record(tx, {
          actor: { type: ActorType.USER, userId: actor.id },
          action,
          entity: { type: AuditEntityType.QUALITY_DISPOSITION, id: disposition.id },
          newValues: {
            lotId,
            inspectionId: inspection.id,
            inspectionResult: inspection.result,
            disposition: dto.type,
            reason: disposition.reason,
            previousLotStatus: 'REJECTED',
            newLotStatus: result.status,
            decidedByUserId: actor.id,
            decidedAt: disposition.decidedAt.toISOString(),
            ...(dto.type === 'SCRAP' ? { scrappedInventory: result.scrappedInventory } : {}),
          },
        });
        return disposition;
      },
      { timeout: 15000 },
    );
  }
}
