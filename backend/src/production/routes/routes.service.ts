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

import type {
  CreateProductionRouteDto,
  RouteOperationDto,
  UpdateProductionRouteDto,
} from './dto/routes.dto.js';

import type { RoutesQueryDto } from './dto/routes-query.dto.js';

const productSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  unit: true,
  isActive: true,
} satisfies Prisma.ProductSelect;

const detailInclude = {
  product: { select: productSelect },
  operations: { orderBy: [{ sequence: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.ProductionRouteInclude;

type Tx = Prisma.TransactionClient;

type Detail = Prisma.ProductionRouteGetPayload<{ include: typeof detailInclude }>;

export function operationData(operations: RouteOperationDto[]) {
  if (!Array.isArray(operations) || operations.length === 0)
    throw new BadRequestException('La ruta necesita al menos una operación');

  const sequences = new Set<number>();

  return operations.map((op) => {
    if (
      !Number.isInteger(op.sequence) ||
      op.sequence <= 0 ||
      op.sequence > 2147483647 ||
      sequences.has(op.sequence)
    )
      throw new BadRequestException('Secuencia positiva y única requerida');

    sequences.add(op.sequence);

    if (typeof op.name !== 'string' || !op.name.trim() || op.name.trim().length > 120)
      throw new BadRequestException('Nombre de operación inválido');

    if (
      typeof op.standardMinutes !== 'string' ||
      !/^(?!0+(?:\.0+)?$)\d{1,10}(?:\.\d{1,2})?$/.test(op.standardMinutes)
    )
      throw new BadRequestException('Minutos estándar inválidos');

    return {
      sequence: op.sequence,
      name: op.name.trim(),
      description: op.description?.trim() || null,
      standardMinutes: new Prisma.Decimal(op.standardMinutes),
    };
  });
}

export function serializeRoute(route: Detail) {
  return {
    ...route,
    operations: route.operations.map((op) => ({
      ...op,
      standardMinutes: op.standardMinutes.toFixed(2),
    })),
    operationCount: route.operations.length,

    totalStandardMinutes: route.operations
      .reduce((sum, op) => sum.plus(op.standardMinutes), new Prisma.Decimal(0))
      .toFixed(2),
  };
}

function snapshot(route: Detail) {
  const { code, name, productId, description, isActive } = route;

  return {
    code,
    name,
    productId,
    description,
    isActive,
    operations: serializeRoute(route).operations.map(
      ({ sequence, name, description, standardMinutes }) => ({
        sequence,
        name,
        description,
        standardMinutes,
      }),
    ),
  };
}

async function read(tx: Tx, id: string) {
  const route = await tx.productionRoute.findUnique({ where: { id }, include: detailInclude });

  if (!route) throw new NotFoundException('Ruta no encontrada');

  return route;
}

async function lock(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM production_routes WHERE id = ${id}::uuid FOR UPDATE`;

  if (!rows.length) throw new NotFoundException('Ruta no encontrada');

  return read(tx, id);
}

async function validProduct(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM products WHERE id = ${id}::uuid FOR SHARE`;

  const product = await tx.product.findUnique({ where: { id }, select: productSelect });

  if (!product) throw new NotFoundException('Producto no encontrado');

  if (!product.isActive || !['INTERMEDIATE', 'FINISHED_GOOD'].includes(product.type))
    throw new UnprocessableEntityException({
      code: 'INVALID_ROUTE_PRODUCT',
      message: 'La ruta debe pertenecer a un producto activo, intermedio o terminado',
    });
}

function translate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = JSON.stringify(error.meta ?? {});

    throw new ConflictException(
      target.includes('product')
        ? 'Ya existe una ruta para ese producto'
        : 'Ya existe una ruta con ese código',
    );
  }

  throw error;
}

@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: RoutesQueryDto) {
    const { page, limit, search, isActive, productId } = query;

    const where: Prisma.ProductionRouteWhereInput = {
      isActive,
      productId,
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { product: { code: { contains: search, mode: 'insensitive' } } },
              { product: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [routes, total] = await this.prisma.$transaction([
      this.prisma.productionRoute.findMany({
        where,
        select: {
          id: true,
          productId: true,
          code: true,
          name: true,
          description: true,
          isActive: true,
          product: { select: productSelect },
          operations: { select: { standardMinutes: true } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),

      this.prisma.productionRoute.count({ where }),
    ]);

    return {
      data: routes.map(({ operations, ...route }) => ({
        ...route,
        operationCount: operations.length,
        totalStandardMinutes: operations
          .reduce((sum, op) => sum.plus(op.standardMinutes), new Prisma.Decimal(0))
          .toFixed(2),
      })),
      meta: { page, limit, total },
    };
  }

  async get(id: string) {
    return serializeRoute(await read(this.prisma, id));
  }

  async create(actor: AuthenticatedUser, dto: CreateProductionRouteDto) {
    const operations = operationData(dto.operations);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await validProduct(tx, dto.productId.toLowerCase());

        const route = await tx.productionRoute.create({
          data: {
            productId: dto.productId.toLowerCase(),
            code: dto.code.trim().toUpperCase(),
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            operations: { create: operations },
          },
          include: detailInclude,
        });

        await this.record(tx, actor, AuditAction.CREATE, null, route);

        return serializeRoute(route);
      });
    } catch (error) {
      translate(error);
    }
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateProductionRouteDto) {
    if (dto.code === undefined && dto.name === undefined && dto.description === undefined)
      throw new BadRequestException('Indica los datos para actualizar');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await lock(tx, id);

        const after = await tx.productionRoute.update({
          where: { id },
          data: {
            code: dto.code?.trim().toUpperCase(),
            name: dto.name?.trim(),
            description:
              dto.description === undefined ? undefined : dto.description?.trim() || null,
          },
          include: detailInclude,
        });

        await this.record(tx, actor, AuditAction.UPDATE, before, after);

        return serializeRoute(after);
      });
    } catch (error) {
      translate(error);
    }
  }

  async setStatus(actor: AuthenticatedUser, id: string, isActive: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const before = await lock(tx, id);

      if (before.isActive === isActive) throw new ConflictException('La ruta ya tiene ese estado');

      if (isActive) {
        await validProduct(tx, before.productId);
        operationData(serializeRoute(before).operations);
      }

      const after = await tx.productionRoute.update({
        where: { id },
        data: { isActive },
        include: detailInclude,
      });

      await this.record(
        tx,
        actor,
        isActive ? AuditAction.ENABLE : AuditAction.DISABLE,
        before,
        after,
      );

      return serializeRoute(after);
    });
  }

  async replaceOperations(actor: AuthenticatedUser, id: string, input: RouteOperationDto[]) {
    const operations = operationData(input);

    return this.prisma.$transaction(async (tx) => {
      const before = await lock(tx, id);

      await tx.routeOperation.deleteMany({ where: { routeId: id } });

      await tx.productionRoute.update({
        where: { id },
        data: { operations: { create: operations } },
      });

      const after = await read(tx, id);

      await this.record(tx, actor, AuditAction.UPDATE, before, after);

      return serializeRoute(after);
    });
  }

  private async record(
    tx: Tx,
    actor: AuthenticatedUser,
    action: AuditAction,
    before: Detail | null,
    after: Detail,
  ) {
    await this.audit.record(tx, {
      actor: { type: ActorType.USER, userId: actor.id },
      action,
      entity: { type: AuditEntityType.PRODUCTION_ROUTE, id: after.id },
      previousValues: before ? snapshot(before) : undefined,
      newValues: snapshot(after),
    });
  }
}
