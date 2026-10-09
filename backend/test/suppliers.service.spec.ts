import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { SuppliersService } from '../src/purchases/suppliers/suppliers.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { NotFoundException } from '@nestjs/common';
import { AuditAction, AuditEntityType, ActorType } from '../src/generated/prisma/client.js';

interface MockPrismaService {
  $transaction: Mock;
  supplier: {
    create: Mock;
    findMany: Mock;
    findUnique: Mock;
    update: Mock;
  };
  auditLog: {
    create: Mock;
  };
}

describe('SuppliersService', () => {
  let service: SuppliersService;

  const mockUserId = 'user-uuid-123';
  const mockSupplierId = 'supplier-uuid-123';

  const mockSupplier = {
    id: mockSupplierId,
    name: 'Eco Proveedor S.A.',
    phone: '8888-8888',
    email: 'contacto@ecoproveedor.com',
    address: 'Managua, Nicaragua',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService: MockPrismaService = {
    $transaction: vi.fn(),
    supplier: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  beforeEach(async () => {
    mockPrismaService.$transaction.mockImplementation(
      async <T>(callback: (tx: PrismaService) => Promise<T>): Promise<T> => {
        return callback(mockPrismaService as unknown as PrismaService);
      }
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SuppliersService>(SuppliersService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('debe crear un proveedor y registrar en auditoría', async () => {
      const dto = {
        name: 'Eco Proveedor S.A.',
        phone: '8888-8888',
        email: 'contacto@ecoproveedor.com',
        address: 'Managua, Nicaragua',
      };

      mockPrismaService.supplier.create.mockResolvedValue(mockSupplier);
      mockPrismaService.auditLog.create.mockResolvedValue({});

      const result = await service.create(dto, mockUserId);

      expect(mockPrismaService.supplier.create).toHaveBeenCalledWith({ data: dto });
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorType: ActorType.USER,
          actorUserId: mockUserId,
          action: AuditAction.CREATE,
          entityType: AuditEntityType.SUPPLIER,
          entityId: mockSupplierId,
          newValues: mockSupplier,
        },
      });
      expect(result).toEqual(mockSupplier);
    });
  });

  describe('findAll', () => {
    it('debe retornar todos los proveedores ordenados por fecha', async () => {
      mockPrismaService.supplier.findMany.mockResolvedValue([mockSupplier]);
      const result = await service.findAll();
      
      expect(mockPrismaService.supplier.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
      expect(result).toEqual([mockSupplier]);
    });
  });

  describe('findOne', () => {
    it('debe retornar un proveedor si existe', async () => {
      mockPrismaService.supplier.findUnique.mockResolvedValue(mockSupplier);
      const result = await service.findOne(mockSupplierId);
      
      expect(mockPrismaService.supplier.findUnique).toHaveBeenCalledWith({ where: { id: mockSupplierId } });
      expect(result).toEqual(mockSupplier);
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      mockPrismaService.supplier.findUnique.mockResolvedValue(null);
      await expect(service.findOne('invalido')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('debe actualizar un proveedor y registrar en auditoría', async () => {
      const dto = { name: 'Nuevo Nombre' };
      const updatedSupplier = { ...mockSupplier, ...dto };

      mockPrismaService.supplier.findUnique.mockResolvedValue(mockSupplier);
      mockPrismaService.supplier.update.mockResolvedValue(updatedSupplier);

      const result = await service.update(mockSupplierId, dto, mockUserId);

      expect(mockPrismaService.supplier.update).toHaveBeenCalledWith({
        where: { id: mockSupplierId },
        data: dto,
      });
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorType: ActorType.USER,
          actorUserId: mockUserId,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.SUPPLIER,
          entityId: mockSupplierId,
          previousValues: mockSupplier,
          newValues: updatedSupplier,
        },
      });
      expect(result.name).toBe('Nuevo Nombre');
    });
  });

  describe('updateStatus', () => {
    it('debe desactivar un proveedor y registrar DISABLE en auditoría', async () => {
      const updatedSupplier = { ...mockSupplier, isActive: false };

      mockPrismaService.supplier.findUnique.mockResolvedValue(mockSupplier);
      mockPrismaService.supplier.update.mockResolvedValue(updatedSupplier);

      const result = await service.updateStatus(mockSupplierId, { isActive: false }, mockUserId);

      expect(mockPrismaService.supplier.update).toHaveBeenCalledWith({
        where: { id: mockSupplierId },
        data: { isActive: false },
      });
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorType: ActorType.USER,
          actorUserId: mockUserId,
          action: AuditAction.DISABLE,
          entityType: AuditEntityType.SUPPLIER,
          entityId: mockSupplierId,
        },
      });
      expect(result.isActive).toBe(false);
    });
  });
});