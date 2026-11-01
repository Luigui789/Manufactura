import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/access-policy.js';
import { ActorType, AuditAction, AuditEntityType, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CARBON_SCALE, parseFactorValue } from '../carbon-math.js';
import { productFactorViolation } from '../carbon-rules.js';
import { translateSustainabilityError } from '../sustainability-errors.js';
import type {
  CreateEmissionFactorDto,
  EmissionFactorsQueryDto,
  UpdateEmissionFactorDto,
} from './emission-factors.dto.js';

type Tx = Prisma.TransactionClient;

const include = {
  product: { select: { id: true, code: true, name: true, unit: true, isActive: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.EmissionFactorInclude;

type Factor = Prisma.EmissionFactorGetPayload<{ include: typeof include }>;

const conflicts = {
  product: 'Ya existe un factor activo para ese producto',
  code: 'Ya existe un factor con ese código',
};

export function serializeFactor(factor: Factor) {
  return { ...factor, kgCo2ePerUnit: factor.kgCo2ePerUnit.toFixed(CARBON_SCALE) };
}

function snapshot(factor: Factor) {
  return {
    code: factor.code,
    name: factor.name,
    category: factor.category,
    activityUnit: factor.activityUnit,
    kgCo2ePerUnit: factor.kgCo2ePerUnit.toFixed(CARBON_SCALE),
    productId: factor.productId,
    sourceName: factor.sourceName,
    sourceReference: factor.sourceReference,
    sourceYear: factor.sourceYear,
    notes: factor.notes,
    isActive: factor.isActive,
  };
}

async function lock(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM emission_factors WHERE id = ${id}::uuid FOR UPDATE`;
  if (!rows.length) throw new NotFoundException('Factor de emisión no encontrado');
  return tx.emissionFactor.findUniqueOrThrow({ where: { id }, include });
}

/** Valida existencia y compatibilidad dimensional del producto asociado (422 sin densidad). */
async function validateProduct(
  tx: Tx,
  productId: string,
  factor: Pick<Factor, 'category' | 'activityUnit'>,
) {
  await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR SHARE`;
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundException('Producto no encontrado');
  const violation = productFactorViolation(factor, product.unit);
  if (violation) throw new UnprocessableEntityException(violation);
}

@Injectable()
export class EmissionFactorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: EmissionFactorsQueryDto) {
    const { page, limit, search, category, isActive, productId } = query;
    const where: Prisma.EmissionFactorWhereInput = {
      category,
      isActive,
      productId,
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { sourceName: { contains: search, mode: 'insensitive' } },
              { product: { code: { contains: search, mode: 'insensitive' } } },
              { product: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [factors, total] = await this.prisma.$transaction([
      this.prisma.emissionFactor.findMany({
        where,
        include,
        orderBy: [{ isActive: 'desc' }, { code: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.emissionFactor.count({ where }),
    ]);
    return { data: factors.map(serializeFactor), meta: { page, limit, total } };
  }

  async get(id: string) {
    const factor = await this.prisma.emissionFactor.findUnique({ where: { id }, include });
    if (!factor) throw new NotFoundException('Factor de emisión no encontrado');
    return serializeFactor(factor);
  }

  async create(actor: AuthenticatedUser, dto: CreateEmissionFactorDto) {
    const value = this.value(dto.kgCo2ePerUnit);
    const productId = dto.productId ? dto.productId.toLowerCase() : null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (productId) await validateProduct(tx, productId, dto);
        const factor = await tx.emissionFactor.create({
          data: {
            code: dto.code,
            name: dto.name,
            category: dto.category,
            activityUnit: dto.activityUnit,
            kgCo2ePerUnit: value,
            productId,
            sourceName: dto.sourceName,
            sourceReference: dto.sourceReference,
            sourceYear: dto.sourceYear ?? null,
            notes: dto.notes ?? null,
            createdByUserId: actor.id,
          },
          include,
        });
        await this.record(tx, actor, AuditAction.CREATE, null, factor);
        return serializeFactor(factor);
      });
    } catch (error) {
      translateSustainabilityError(error, conflicts);
    }
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateEmissionFactorDto) {
    const keys = [
      'name',
      'kgCo2ePerUnit',
      'sourceName',
      'sourceReference',
      'sourceYear',
      'notes',
    ] as const;
    if (keys.every((key) => dto[key] === undefined))
      throw new BadRequestException('Indica los datos para actualizar');
    for (const key of ['name', 'kgCo2ePerUnit', 'sourceName', 'sourceReference'] as const)
      if (dto[key] === null) throw new BadRequestException(`${key} no puede ser nulo`);
    const value = dto.kgCo2ePerUnit === undefined ? undefined : this.value(dto.kgCo2ePerUnit);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await lock(tx, id);
        const after = await tx.emissionFactor.update({
          where: { id },
          data: {
            name: dto.name,
            kgCo2ePerUnit: value,
            sourceName: dto.sourceName,
            sourceReference: dto.sourceReference,
            sourceYear: dto.sourceYear,
            notes: dto.notes,
          },
          include,
        });
        await this.record(tx, actor, AuditAction.UPDATE, before, after);
        return serializeFactor(after);
      });
    } catch (error) {
      translateSustainabilityError(error, conflicts);
    }
  }

  async setStatus(actor: AuthenticatedUser, id: string, isActive: boolean) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await lock(tx, id);
        if (before.isActive === isActive)
          throw new ConflictException('El factor ya tiene ese estado');
        if (isActive && before.productId) await validateProduct(tx, before.productId, before);
        const after = await tx.emissionFactor.update({
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
        return serializeFactor(after);
      });
    } catch (error) {
      translateSustainabilityError(error, conflicts);
    }
  }

  private value(input: string) {
    try {
      return parseFactorValue(input);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  private async record(
    tx: Tx,
    actor: AuthenticatedUser,
    action: AuditAction,
    before: Factor | null,
    after: Factor,
  ) {
    await this.audit.record(tx, {
      actor: { type: ActorType.USER, userId: actor.id },
      action,
      entity: { type: AuditEntityType.EMISSION_FACTOR, id: after.id },
      previousValues: before ? snapshot(before) : undefined,
      newValues: snapshot(after),
    });
  }
}
