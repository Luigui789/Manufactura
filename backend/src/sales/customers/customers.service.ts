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
  type Customer,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateCustomerDto, UpdateCustomerDto } from './dto/customers.dto.js';

type Tx = Prisma.TransactionClient;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(page: number, limit: number) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.customer.count(),
    ]);

    return {
      data,
      meta: { page, limit, total },
    };
  }

  async get(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return customer;
  }

  async create(actor: AuthenticatedUser, dto: CreateCustomerDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
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
            type: AuditEntityType.CUSTOMER,
            id: customer.id,
          },
          newValues: customerSnapshot(customer),
        });

        return customer;
      });
    } catch (error) {
      throw translateUniqueCode(error);
    }
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateCustomerDto) {
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
        const before = await lockCustomer(tx, id);

        const after = await tx.customer.update({
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
      const before = await lockCustomer(tx, id);

      if (before.isActive === isActive) {
        throw new ConflictException('El cliente ya tiene ese estado');
      }

      const after = await tx.customer.update({
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
    before: Customer,
    after: Customer,
  ) {
    const previous = customerSnapshot(before);
    const current = customerSnapshot(after);

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
        type: AuditEntityType.CUSTOMER,
        id: after.id,
      },
      previousValues: Object.fromEntries(changed.map((key) => [key, previous[key]])),
      newValues: Object.fromEntries(changed.map((key) => [key, current[key]])),
    });
  }
}

// Campos permitidos en la auditoría de clientes.
function customerSnapshot(customer: Customer) {
  return {
    code: customer.code,
    name: customer.name,
    taxId: customer.taxId,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    isActive: customer.isActive,
  };
}

// Serializa las modificaciones sobre el mismo cliente.
async function lockCustomer(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM customers
    WHERE id = ${id}::uuid
    FOR NO KEY UPDATE
  `;

  if (rows.length === 0) {
    throw new NotFoundException('Cliente no encontrado');
  }

  return tx.customer.findUniqueOrThrow({
    where: { id },
  });
}

// Convierte el código duplicado en un conflicto HTTP 409.
function translateUniqueCode(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ConflictException('Ya existe un cliente con ese código');
  }

  return error;
}
