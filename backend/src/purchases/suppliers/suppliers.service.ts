import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateSupplierDto } from './dto/create-suplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { UpdateSupplierStatusDto } from './dto/update-supplier-status.dto.js';
import { AuditAction, AuditEntityType, ActorType } from '../../generated/prisma/client.js';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createSupplierDto: CreateSupplierDto, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: createSupplierDto,
      });

      await tx.auditLog.create({
        data: {
          actorType: ActorType.USER,
          actorUserId,
          action: AuditAction.CREATE,
          entityType: AuditEntityType.SUPPLIER,
          entityId: supplier.id,
          newValues: supplier,
        },
      });

      return supplier;
    });
  }

  async findAll() {
    return this.prisma.supplier.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException(`Supplier not found`);
    return supplier;
  }

  async update(id: string, updateSupplierDto: UpdateSupplierDto, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.supplier.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`Supplier not found`);

      const updated = await tx.supplier.update({
        where: { id },
        data: updateSupplierDto,
      });

      await tx.auditLog.create({
        data: {
          actorType: ActorType.USER,
          actorUserId,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.SUPPLIER,
          entityId: updated.id,
          previousValues: existing,
          newValues: updated,
        },
      });

      return updated;
    });
  }

  // Cumple con la regla: No se debe eliminar físicamente un proveedor
  async updateStatus(id: string, updateSupplierStatusDto: UpdateSupplierStatusDto, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.supplier.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`Supplier not found`);

      const updated = await tx.supplier.update({
        where: { id },
        data: { isActive: updateSupplierStatusDto.isActive },
      });

      await tx.auditLog.create({
        data: {
          actorType: ActorType.USER,
          actorUserId,
          action: updated.isActive ? AuditAction.ENABLE : AuditAction.DISABLE,
          entityType: AuditEntityType.SUPPLIER,
          entityId: updated.id,
        },
      });

      return updated;
    });
  }
}