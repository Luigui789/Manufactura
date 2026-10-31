import {
  BadRequestException,
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
  type CarbonActivityUnit,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { areUnitsCompatible, productUnitAsActivityUnit } from '../carbon-units.js';
import { translateSustainabilityError } from '../sustainability-errors.js';
import type {
  CircularMaterialsQueryDto,
  CreateCircularMaterialDto,
  UpdateCircularMaterialDto,
} from './circular-materials.dto.js';

type Tx = Prisma.TransactionClient;
const include = {
  product: { select: { id: true, code: true, name: true, unit: true, isActive: true } },
} satisfies Prisma.CircularMaterialProfileInclude;
type Profile = Prisma.CircularMaterialProfileGetPayload<{ include: typeof include }>;
const conflicts = {
  product: 'Ese producto ya tiene un perfil circular',
  metric: 'Ya existe un perfil con ese código de métrica',
};

function snapshot(profile: Profile) {
  const { productId, metricCode, displayName, reportingUnit, isActive } = profile;
  return { productId, metricCode, displayName, reportingUnit, isActive };
}

function assertUnit(productUnit: Profile['product']['unit'], reportingUnit: CarbonActivityUnit) {
  if (!areUnitsCompatible(productUnitAsActivityUnit(productUnit), reportingUnit))
    throw new UnprocessableEntityException({
      code: 'INCOMPATIBLE_REPORTING_UNIT',
      message: `La unidad de reporte ${reportingUnit} no es compatible con la unidad ${productUnit} del producto`,
    });
}

async function lock(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM circular_material_profiles WHERE id = ${id}::uuid FOR UPDATE`;
  if (!rows.length) throw new NotFoundException('Perfil circular no encontrado');
  return tx.circularMaterialProfile.findUniqueOrThrow({ where: { id }, include });
}

@Injectable()
export class CircularMaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: CircularMaterialsQueryDto) {
    const { page, limit, isActive } = query;
    const where: Prisma.CircularMaterialProfileWhereInput = { isActive };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.circularMaterialProfile.findMany({
        where,
        include,
        orderBy: [{ metricCode: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.circularMaterialProfile.count({ where }),
    ]);
    return { data, meta: { page, limit, total } };
  }

  async create(actor: AuthenticatedUser, dto: CreateCircularMaterialDto) {
    const productId = dto.productId.toLowerCase();
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR SHARE`;
        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) throw new NotFoundException('Producto no encontrado');
        assertUnit(product.unit, dto.reportingUnit);
        const profile = await tx.circularMaterialProfile.create({
          data: {
            productId,
            metricCode: dto.metricCode,
            displayName: dto.displayName,
            reportingUnit: dto.reportingUnit,
          },
          include,
        });
        await this.record(tx, actor, AuditAction.CREATE, null, profile);
        return profile;
      });
    } catch (error) {
      translateSustainabilityError(error, conflicts);
    }
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateCircularMaterialDto) {
    if (dto.displayName === undefined && dto.reportingUnit === undefined)
      throw new BadRequestException('Indica los datos para actualizar');
    return this.prisma.$transaction(async (tx) => {
      const before = await lock(tx, id);
      if (dto.reportingUnit) assertUnit(before.product.unit, dto.reportingUnit);
      const after = await tx.circularMaterialProfile.update({
        where: { id },
        data: { displayName: dto.displayName, reportingUnit: dto.reportingUnit },
        include,
      });
      await this.record(tx, actor, AuditAction.UPDATE, before, after);
      return after;
    });
  }

  async setStatus(actor: AuthenticatedUser, id: string, isActive: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const before = await lock(tx, id);
      if (before.isActive === isActive)
        throw new ConflictException('El perfil ya tiene ese estado');
      const after = await tx.circularMaterialProfile.update({
        where: { id },
        data: { isActive },
        include,
      });
      await this.record(
        tx,
        actor,
        isActive ? AuditAction.ENABLE : AuditAction.DISABLE,
        before,
        after,
      );
      return after;
    });
  }

  private async record(
    tx: Tx,
    actor: AuthenticatedUser,
    action: AuditAction,
    before: Profile | null,
    after: Profile,
  ) {
    await this.audit.record(tx, {
      actor: { type: ActorType.USER, userId: actor.id },
      action,
      entity: { type: AuditEntityType.CIRCULAR_MATERIAL_PROFILE, id: after.id },
      previousValues: before ? snapshot(before) : undefined,
      newValues: snapshot(after),
    });
  }
}
