import { Test, TestingModule } from '@nestjs/testing';
import { SuppliersController } from '../src/purchases/suppliers/suppliers.controller.js';
import { SuppliersService } from '../src/purchases/suppliers/suppliers.service.js';
import { CreateSupplierDto } from '../src/purchases/suppliers/dto/create-suplier.dto.js';
import { UpdateSupplierDto } from '../src/purchases/suppliers/dto/update-supplier.dto.js';
import { UpdateSupplierStatusDto } from '../src/purchases/suppliers/dto/update-supplier-status.dto.js';

describe('SuppliersController', () => {
  let controller: SuppliersController;
  let service: SuppliersService;

  const mockUserId = 'user-uuid-123';
  const mockSupplierId = 'supplier-uuid-123';
  const mockRequest = { user: { id: mockUserId } };

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

  // Reemplazamos jest.fn() por vi.fn()
  const mockSuppliersService = {
    create: vi.fn().mockResolvedValue(mockSupplier),
    findAll: vi.fn().mockResolvedValue([mockSupplier]),
    findOne: vi.fn().mockResolvedValue(mockSupplier),
    update: vi.fn().mockResolvedValue(mockSupplier),
    updateStatus: vi.fn().mockResolvedValue({ ...mockSupplier, isActive: false }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuppliersController],
      providers: [
        {
          provide: SuppliersService,
          useValue: mockSuppliersService,
        },
      ],
    }).compile();

    controller = module.get<SuppliersController>(SuppliersController);
    service = module.get<SuppliersService>(SuppliersService);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('debe llamar al servicio para crear un proveedor', async () => {
      const dto: CreateSupplierDto = {
        name: 'Eco Proveedor S.A.',
        phone: '8888-8888',
        email: 'contacto@ecoproveedor.com',
        address: 'Managua, Nicaragua',
      };

      const result = await controller.create(dto, mockRequest);
      expect(service.create).toHaveBeenCalledWith(dto, mockUserId);
      expect(result).toEqual(mockSupplier);
    });
  });

  describe('findAll', () => {
    it('debe retornar un arreglo de proveedores', async () => {
      const result = await controller.findAll();
      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual([mockSupplier]);
    });
  });

  describe('findOne', () => {
    it('debe retornar un proveedor específico', async () => {
      const result = await controller.findOne(mockSupplierId);
      expect(service.findOne).toHaveBeenCalledWith(mockSupplierId);
      expect(result).toEqual(mockSupplier);
    });
  });

  describe('update', () => {
    it('debe llamar al servicio para actualizar un proveedor', async () => {
      const dto: UpdateSupplierDto = { name: 'Eco Proveedor Editado' };
      const result = await controller.update(mockSupplierId, dto, mockRequest);
      
      expect(service.update).toHaveBeenCalledWith(mockSupplierId, dto, mockUserId);
      expect(result).toEqual(mockSupplier);
    });
  });

  describe('updateStatus', () => {
    it('debe llamar al servicio para cambiar el estado de un proveedor', async () => {
      const dto: UpdateSupplierStatusDto = { isActive: false };
      const result = await controller.updateStatus(mockSupplierId, dto, mockRequest);
      
      expect(service.updateStatus).toHaveBeenCalledWith(mockSupplierId, dto, mockUserId);
      expect(result.isActive).toBe(false);
    });
  });
});