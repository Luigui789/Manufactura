import { Controller, Get, Post, Body, Patch, Param, Req } from '@nestjs/common';
import { SuppliersService } from './suppliers.service.js';
import { CreateSupplierDto } from './dto/create-suplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { UpdateSupplierStatusDto } from './dto/update-supplier-status.dto.js';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Suppliers')
@ApiBearerAuth()
@Controller('api/suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @ApiOperation({ summary: 'Crear proveedor' })
  create(@Body() createSupplierDto: CreateSupplierDto, @Req() req: any) {
    const userId = req.user.id;
    return this.suppliersService.create(createSupplierDto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Consultar proveedores' })
  findAll() {
    return this.suppliersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar el detalle de un proveedor' })
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar proveedor' })
  update(@Param('id') id: string, @Body() updateSupplierDto: UpdateSupplierDto, @Req() req: any) {
    const userId = req.user.id;
    return this.suppliersService.update(id, updateSupplierDto, userId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activar o desactivar proveedor' })
  updateStatus(@Param('id') id: string, @Body() updateSupplierStatusDto: UpdateSupplierStatusDto, @Req() req: any) {
    const userId = req.user.id;
    return this.suppliersService.updateStatus(id, updateSupplierStatusDto, userId);
  }
}