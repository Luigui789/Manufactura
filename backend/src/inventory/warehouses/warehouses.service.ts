import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/access-policy.js';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  Prisma,
  type Warehouse,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouses.dto.js';

type Tx = Prisma.TransactionClient;

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(page: number, limit: number) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.warehouse.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { code: 'asc' },
      }),
      this.prisma.warehouse.count(),
    ]);

    return {
      data,
      meta: { page, limit, total },
    };
  }

  async get(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
    });

    if (!warehouse) {
      throw new NotFoundException('Almacén no encontrado');
    }

    return warehouse;
  }

  async create(actor: AuthenticatedUser, dto: CreateWarehouseDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const warehouse = await tx.warehouse.create({
          data: {
            code: dto.code,
            name: dto.name,
            location: dto.location,
            isActive: dto.isActive ?? true,
          },
        });

        await this.audit.record(tx, {
          actor: {
            type: ActorType.USER,
            userId: actor.id,
          },
          action: AuditAction.CREATE,
          entity: {
            type: AuditEntityType.WAREHOUSE,
            id: warehouse.id,
          },
          newValues: warehouseSnapshot(warehouse),
        });

        return warehouse;
      });
    } catch (error) {
      throw translateUniqueCode(error);
    }
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateWarehouseDto) {
    const data = {
      code: dto.code,
      name: dto.name,
      location: dto.location,
    };

    const hasFields = Object.values(data).some((value) => value !== undefined);

    if (!hasFields) {
      throw new BadRequestException('Indica al menos un campo para actualizar');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await lockWarehouse(tx, id);

        const after = await tx.warehouse.update({
          where: { id },
          data,
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
      const before = await lockWarehouse(tx, id);

      if (before.isActive === isActive) {
        throw new ConflictException('El almacén ya tiene ese estado');
      }

      if (!isActive) {
        const stocked = await tx.stockBalance.findFirst({
          where: {
            warehouseId: id,
            quantity: { not: 0 },
          },
          select: { id: true },
        });

        if (stocked) {
          throw new ConflictException(
            'No se puede desactivar un almacén con existencias; el saldo debe ser cero para todos sus productos',
          );
        }
      }

      const after = await tx.warehouse.update({
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
    before: Warehouse,
    after: Warehouse,
  ) {
    const previous = warehouseSnapshot(before);
    const current = warehouseSnapshot(after);

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
        type: AuditEntityType.WAREHOUSE,
        id: after.id,
      },
      previousValues: Object.fromEntries(changed.map((key) => [key, previous[key]])),
      newValues: Object.fromEntries(changed.map((key) => [key, current[key]])),
    });
  }
}

// Campos permitidos en la auditoría de almacenes.
function warehouseSnapshot(warehouse: Warehouse) {
  return {
    code: warehouse.code,
    name: warehouse.name,
    location: warehouse.location,
    isActive: warehouse.isActive,
  };
}

// Serializa las modificaciones sobre el mismo almacén.
async function lockWarehouse(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM warehouses
    WHERE id = ${id}::uuid
    FOR NO KEY UPDATE
  `;

  if (rows.length === 0) {
    throw new NotFoundException('Almacén no encontrado');
  }

  return tx.warehouse.findUniqueOrThrow({
    where: { id },
  });
}

// Convierte los códigos duplicados en un conflicto HTTP 409.
function translateUniqueCode(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ConflictException('Ya existe un almacén con ese código');
  }

  return error;
}
