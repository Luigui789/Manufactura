import { Controller, Get, Post, Body, Patch, Param } from '@nestjs/common';
import { SuppliersService } from './suppliers.service.js';
import { CreateSupplierDto } from './dto/create-suplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { UpdateSupplierStatusDto } from './dto/update-supplier-status.dto.js';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import * as accessPolicy from '../../auth/access-policy.js';
import { RoleCode } from '../../generated/prisma/client.js';

@ApiTags('Suppliers')
@ApiBearerAuth()
@Controller('api/suppliers')
@accessPolicy.Authenticated()
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @accessPolicy.Roles(RoleCode.ADMIN, RoleCode.COMPRAS)
  @ApiOperation({ summary: 'Crear proveedor' })
  create(
    @Body() createSupplierDto: CreateSupplierDto,
    @accessPolicy.CurrentUser() user: accessPolicy.AuthenticatedUser,
  ) {
    return this.suppliersService.create(createSupplierDto, user.id);
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
  @accessPolicy.Roles(RoleCode.ADMIN, RoleCode.COMPRAS)
  @ApiOperation({ summary: 'Editar proveedor' })
  update(
    @Param('id') id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
    @accessPolicy.CurrentUser() user: accessPolicy.AuthenticatedUser,
  ) {
    return this.suppliersService.update(id, updateSupplierDto, user.id);
  }

  @Patch(':id/status')
  @accessPolicy.Roles(RoleCode.ADMIN, RoleCode.COMPRAS)
  @ApiOperation({ summary: 'Activar o desactivar proveedor' })
  updateStatus(
    @Param('id') id: string,
    @Body() updateSupplierStatusDto: UpdateSupplierStatusDto,
    @accessPolicy.CurrentUser() user: accessPolicy.AuthenticatedUser,
  ) {
    return this.suppliersService.updateStatus(id, updateSupplierStatusDto, user.id);
  }
}
