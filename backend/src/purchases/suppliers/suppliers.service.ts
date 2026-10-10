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
  type Supplier,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateSupplierDto, UpdateSupplierDto } from './dto/suppliers.dto.js';

type Tx = Prisma.TransactionClient;

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(page: number, limit: number) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supplier.count(),
    ]);

    return {
      data,
      meta: { page, limit, total },
    };
  }

  async get(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
    });

    if (!supplier) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    return supplier;
  }

  async create(actor: AuthenticatedUser, dto: CreateSupplierDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.create({
          data: {
            code: dto.code,
            name: dto.name,
            taxId: dto.taxId,
            email: dto.email,
            phone: dto.phone,
            address: dto.address,
          },
        });

        await this.audit.record(tx, {
          actor: {
            type: ActorType.USER,
            userId: actor.id,
          },
          action: AuditAction.CREATE,
          entity: {
            type: AuditEntityType.SUPPLIER,
            id: supplier.id,
          },
          newValues: supplierSnapshot(supplier),
        });

        return supplier;
      });
    } catch (error) {
      throw translateUniqueCode(error);
    }
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateSupplierDto) {
    const data = {
      code: dto.code,
      name: dto.name,
      taxId: dto.taxId,
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
    };

    const hasFields = Object.values(data).some((value) => value !== undefined);

    if (!hasFields) {
      throw new BadRequestException('Indica al menos un campo para actualizar');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await lockSupplier(tx, id);

        const after = await tx.supplier.update({
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
      const before = await lockSupplier(tx, id);

      if (before.isActive === isActive) {
        throw new ConflictException('El proveedor ya tiene ese estado');
      }

      const after = await tx.supplier.update({
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
    before: Supplier,
    after: Supplier,
  ) {
    const previous = supplierSnapshot(before);
    const current = supplierSnapshot(after);

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
        type: AuditEntityType.SUPPLIER,
        id: after.id,
      },
      previousValues: Object.fromEntries(changed.map((key) => [key, previous[key]])),
      newValues: Object.fromEntries(changed.map((key) => [key, current[key]])),
    });
  }
}

// Campos permitidos en la auditoría de proveedores.
function supplierSnapshot(supplier: Supplier) {
  return {
    code: supplier.code,
    name: supplier.name,
    taxId: supplier.taxId,
    email: supplier.email,
    phone: supplier.phone,
    address: supplier.address,
    isActive: supplier.isActive,
  };
}

// Serializa las modificaciones sobre el mismo proveedor.
async function lockSupplier(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM suppliers
    WHERE id = ${id}::uuid
    FOR NO KEY UPDATE
  `;

  if (rows.length === 0) {
    throw new NotFoundException('Proveedor no encontrado');
  }

  return tx.supplier.findUniqueOrThrow({
    where: { id },
  });
}

// Convierte el código duplicado en un conflicto HTTP 409.
function translateUniqueCode(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ConflictException('Ya existe un proveedor con ese código');
  }

  return error;
}
