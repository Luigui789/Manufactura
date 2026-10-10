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
import { RoleCode } from '../../generated/prisma/client.js';
import { SetCatalogStatusDto } from '../../common/catalog.dto.js';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouses.dto.js';
import { WarehousesQueryDto } from './dto/warehouses-query.dto.js';
import { WarehouseResultDto, WarehousesListDto } from './warehouses-response.js';
import { WarehousesService } from './warehouses.service.js';

@ApiTags('Warehouses')
@ApiCookieAuth(SESSION_COOKIE)
@ApiResponse({ status: 400, description: 'Datos, filtros, paginación o UUID inválidos' })
@ApiResponse({ status: 401, description: 'Sin sesión válida' })
@ApiResponse({ status: 403, description: 'Acceso denegado' })
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  @Authenticated()
  @ApiOperation({
    summary: 'Lista paginada de almacenes',
    description:
      'Permite filtrar por estado y buscar por código, nombre o ubicación. El total corresponde a los filtros aplicados.',
  })
  @ApiOkResponse({ type: WarehousesListDto })
  list(@Query() query: WarehousesQueryDto) {
    return this.warehouses.list(query);
  }

  @Get(':id')
  @Authenticated()
  @ApiOperation({ summary: 'Consulta el detalle de un almacén' })
  @ApiOkResponse({ type: WarehouseResultDto })
  @ApiResponse({ status: 404, description: 'Almacén no encontrado' })
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      data: await this.warehouses.get(id),
      message: 'Almacén encontrado',
    };
  }

  @Post()
  @Roles(RoleCode.ADMIN, RoleCode.INVENTARIO)
  @ApiOperation({ summary: 'Crea un almacén' })
  @ApiCreatedResponse({ type: WarehouseResultDto })
  @ApiResponse({ status: 409, description: 'Ya existe un almacén con ese código' })
  async create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateWarehouseDto) {
    return {
      data: await this.warehouses.create(actor, dto),
      message: 'Almacén creado',
    };
  }

  @Patch(':id')
  @Roles(RoleCode.ADMIN, RoleCode.INVENTARIO)
  @ApiOperation({ summary: 'Actualiza un almacén' })
  @ApiOkResponse({ type: WarehouseResultDto })
  @ApiResponse({ status: 404, description: 'Almacén no encontrado' })
  @ApiResponse({ status: 409, description: 'Ya existe un almacén con ese código' })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return {
      data: await this.warehouses.update(actor, id, dto),
      message: 'Almacén actualizado',
    };
  }

  @Patch(':id/status')
  @Roles(RoleCode.ADMIN, RoleCode.INVENTARIO)
  @ApiOperation({ summary: 'Activa o desactiva un almacén' })
  @ApiOkResponse({ type: WarehouseResultDto })
  @ApiResponse({ status: 404, description: 'Almacén no encontrado' })
  @ApiResponse({
    status: 409,
    description:
      'El almacén ya tiene ese estado o se intenta desactivarlo con existencias distintas de cero en alguno de sus productos',
  })
  async setStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetCatalogStatusDto,
  ) {
    return {
      data: await this.warehouses.setStatus(actor, id, dto.isActive),
      message: dto.isActive ? 'Almacén activado' : 'Almacén desactivado',
    };
  }
}
