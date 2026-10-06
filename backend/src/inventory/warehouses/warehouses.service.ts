import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/access-policy.js';
import { ActorType, AuditAction, AuditEntityType } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouses.dto.js';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.warehouse.findMany({ skip, take: limit, orderBy: { code: 'asc' } }),
      this.prisma.warehouse.count(),
    ]);
    return { data, meta: { page, limit, total } };
  }

  async get(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) throw new NotFoundException('Almacén no encontrado');
    return warehouse;
  }

  async create(actor: AuthenticatedUser, dto: CreateWarehouseDto) {
    const exists = await this.prisma.warehouse.findUnique({ where: { code: dto.code } });
    if (exists) throw new ConflictException('Ya existe un almacén con ese código');

    const warehouse = await this.prisma.warehouse.create({
      data: { ...dto, isActive: dto.isActive ?? true, location: dto.location ?? '' },
    });

    await this.audit.record(this.prisma, {
      actor: { type: ActorType.USER, userId: actor.id },
      action: AuditAction.CREATE,
      entity: { type: AuditEntityType.WAREHOUSE, id: warehouse.id },
      newValues: { code: warehouse.code, name: warehouse.name },
    });
    return warehouse;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateWarehouseDto) {
    await this.get(id);
    if (dto.code) {
      const exists = await this.prisma.warehouse.findFirst({
        where: { code: dto.code, id: { not: id } },
      });
      if (exists) throw new ConflictException('Ya existe un almacén con ese código');
    }

    const warehouse = await this.prisma.warehouse.update({ where: { id }, data: dto });
    await this.audit.record(this.prisma, {
      actor: { type: ActorType.USER, userId: actor.id },
      action: AuditAction.UPDATE,
      entity: { type: AuditEntityType.WAREHOUSE, id },
      newValues: dto as Record<string, unknown>,
    });
    return warehouse;
  }

  async setStatus(actor: AuthenticatedUser, id: string, isActive: boolean) {
    const warehouse = await this.get(id);
    if (warehouse.isActive === isActive) {
      throw new ConflictException('El almacén ya tiene ese estado');
    }

    const updated = await this.prisma.warehouse.update({ where: { id }, data: { isActive } });
    await this.audit.record(this.prisma, {
      actor: { type: ActorType.USER, userId: actor.id },
      action: isActive ? AuditAction.ENABLE : AuditAction.DISABLE,
      entity: { type: AuditEntityType.WAREHOUSE, id },
      newValues: { isActive },
    });
    return updated;
  }
}
