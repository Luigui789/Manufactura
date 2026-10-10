import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  Authenticated,
  type AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../auth/access-policy.js';
import { SESSION_COOKIE } from '../../auth/session-cookie.js';
import { SetCatalogStatusDto } from '../../common/catalog.dto.js';
import { PaginationQueryDto } from '../../common/pagination/pagination.js';
import { RoleCode } from '../../generated/prisma/client.js';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/suppliers.dto.js';
import { SupplierResultDto, SuppliersListDto } from './suppliers-response.js';
import { SuppliersService } from './suppliers.service.js';

@ApiTags('Suppliers')
@ApiCookieAuth(SESSION_COOKIE)
@ApiResponse({ status: 400, description: 'Datos, paginación o UUID inválidos' })
@ApiResponse({ status: 401, description: 'Sin sesión válida' })
@ApiResponse({ status: 403, description: 'Acceso denegado' })
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Lista paginada de proveedores' })
  @ApiOkResponse({ type: SuppliersListDto })
  list(@Query() query: PaginationQueryDto) {
    return this.suppliers.list(query.page, query.limit);
  }

  @Get(':id')
  @Authenticated()
  @ApiOperation({ summary: 'Consulta el detalle de un proveedor' })
  @ApiOkResponse({ type: SupplierResultDto })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado' })
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      data: await this.suppliers.get(id),
      message: 'Proveedor encontrado',
    };
  }

  @Post()
  @Roles(RoleCode.ADMIN, RoleCode.COMPRAS)
  @ApiOperation({ summary: 'Crea un proveedor' })
  @ApiCreatedResponse({ type: SupplierResultDto })
  @ApiResponse({ status: 409, description: 'Ya existe un proveedor con ese código' })
  async create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateSupplierDto) {
    return {
      data: await this.suppliers.create(actor, dto),
      message: 'Proveedor creado',
    };
  }

  @Patch(':id')
  @Roles(RoleCode.ADMIN, RoleCode.COMPRAS)
  @ApiOperation({ summary: 'Actualiza un proveedor' })
  @ApiOkResponse({ type: SupplierResultDto })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado' })
  @ApiResponse({ status: 409, description: 'Ya existe un proveedor con ese código' })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return {
      data: await this.suppliers.update(actor, id, dto),
      message: 'Proveedor actualizado',
    };
  }

  @Patch(':id/status')
  @Roles(RoleCode.ADMIN, RoleCode.COMPRAS)
  @ApiOperation({ summary: 'Activa o desactiva un proveedor' })
  @ApiOkResponse({ type: SupplierResultDto })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado' })
  @ApiResponse({ status: 409, description: 'El proveedor ya tiene ese estado' })
  async setStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetCatalogStatusDto,
  ) {
    return {
      data: await this.suppliers.setStatus(actor, id, dto.isActive),
      message: dto.isActive ? 'Proveedor activado' : 'Proveedor desactivado',
    };
  }
}
