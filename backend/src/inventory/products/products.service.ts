import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../auth/access-policy.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  Prisma,
  type Product,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateProductDto, UpdateProductDto } from './dto/products.dto.js';
import type { ProductsQueryDto } from './dto/products-query.dto.js';

type Tx = Prisma.TransactionClient;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ProductsQueryDto) {
    const { page, limit, isActive, type, search } = query;

    const where: Prisma.ProductWhereInput = {
      isActive,
      type,
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total },
    };
  }

  async get(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return product;
  }

  async create(actor: AuthenticatedUser, dto: CreateProductDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            code: dto.code,
            name: dto.name,
            category: dto.category,
            type: dto.type,
            unit: dto.unit,
          },
        });

        await this.audit.record(tx, {
          actor: {
            type: ActorType.USER,
            userId: actor.id,
          },
          action: AuditAction.CREATE,
          entity: {
            type: AuditEntityType.PRODUCT,
            id: product.id,
          },
          newValues: productSnapshot(product),
        });

        return product;
      });
    } catch (error) {
      throw translateUniqueCode(error);
    }
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateProductDto) {
    const hasChanges = Object.values(dto).some((value) => value !== undefined);

    if (!hasChanges) {
      throw new BadRequestException('Indica al menos un campo para actualizar');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await lockProduct(tx, id);

        const changesUnit = dto.unit !== undefined && dto.unit !== before.unit;
        const changesType = dto.type !== undefined && dto.type !== before.type;

        if (changesUnit || changesType) {
          const used = await tx.inventoryMovement.findFirst({
            where: { productId: id },
            select: { id: true },
          });

          if (used) {
            throw new ConflictException(
              'No se puede cambiar la unidad ni el tipo de un producto con movimientos de inventario',
            );
          }
        }

        const after = await tx.product.update({
          where: { id },
          data: {
            code: dto.code,
            name: dto.name,
            category: dto.category,
            type: dto.type,
            unit: dto.unit,
          },
        });

        await this.recordChange(tx, actor, AuditAction.UPDATE, before, after);

        return after;
      });
    } catch (error) {
      throw translateUniqueCode(error);
    }
  }

  async setStatus(actor: AuthenticatedUser, id: string, isActive: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const before = await lockProduct(tx, id);

      if (before.isActive === isActive) {
        throw new ConflictException('El producto ya tiene ese estado');
      }

      if (!isActive) {
        const stocked = await tx.stockBalance.findFirst({
          where: {
            productId: id,
            quantity: { not: 0 },
          },
          select: { id: true },
        });

        if (stocked) {
          throw new ConflictException(
            'No se puede desactivar un producto con existencias; el saldo debe ser cero en todos los almacenes',
          );
        }
      }

      const after = await tx.product.update({
        where: { id },
        data: { isActive },
      });

      await this.recordChange(
        tx,
        actor,
        isActive ? AuditAction.ENABLE : AuditAction.DISABLE,
        before,
        after,
      );

      return after;
    });
  }

  private async recordChange(
    tx: Tx,
    actor: AuthenticatedUser,
    action: AuditAction,
    before: Product,
    after: Product,
  ) {
    const previous = productSnapshot(before);
    const current = productSnapshot(after);

    const keys = Object.keys(current) as Array<keyof typeof current>;
    const changed = keys.filter((key) => previous[key] !== current[key]);

    if (changed.length === 0) {
      return;
    }

    await this.audit.record(tx, {
      actor: {
        type: ActorType.USER,
        userId: actor.id,
      },
      action,
      entity: {
        type: AuditEntityType.PRODUCT,
        id: after.id,
      },
      previousValues: Object.fromEntries(changed.map((key) => [key, previous[key]])),
      newValues: Object.fromEntries(changed.map((key) => [key, current[key]])),
    });
  }
}

// Campos permitidos en la auditoría del producto.
function productSnapshot(product: Product) {
  return {
    code: product.code,
    name: product.name,
    category: product.category,
    type: product.type,
    unit: product.unit,
    isActive: product.isActive,
  };
}

// Serializa las modificaciones sobre el mismo producto.
async function lockProduct(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM products
    WHERE id = ${id}::uuid
    FOR NO KEY UPDATE
  `;

  if (rows.length === 0) {
    throw new NotFoundException('Producto no encontrado');
  }

  return tx.product.findUniqueOrThrow({
    where: { id },
  });
}

// Convierte el conflicto de código único en un error HTTP 409.
function translateUniqueCode(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ConflictException('Ya existe un producto con ese código');
  }

  return error;
}
