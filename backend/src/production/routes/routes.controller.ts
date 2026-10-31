import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  Authenticated,
  type AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../auth/access-policy.js';

import { SESSION_COOKIE } from '../../auth/session-cookie.js';

import { RoleCode } from '../../generated/prisma/client.js';

import { SetCatalogStatusDto } from '../../common/catalog.dto.js';

import { RoutesService } from './routes.service.js';

import { RoutesQueryDto } from './dto/routes-query.dto.js';

import {
  CreateProductionRouteDto,
  UpdateProductionRouteDto,
  ReplaceRouteOperationsDto,
} from './dto/routes.dto.js';

@ApiTags('Production Routes')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('production/routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Lista rutas estándar de fabricación' })
  list(@Query() query: RoutesQueryDto) {
    return this.routes.list(query);
  }

  @Get(':id')
  @Authenticated()
  @ApiOperation({ summary: 'Consulta ruta y operaciones ordenadas' })
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.routes.get(id), message: 'Ruta encontrada' };
  }

  @Post()
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Crea ruta y operaciones atómicamente' })
  async create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateProductionRouteDto) {
    return { data: await this.routes.create(actor, dto), message: 'Ruta creada' };
  }

  @Patch(':id')
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Actualiza metadata, conserva el producto' })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductionRouteDto,
  ) {
    return { data: await this.routes.update(actor, id, dto), message: 'Ruta actualizada' };
  }

  @Patch(':id/status')
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Activa o desactiva una ruta' })
  async status(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetCatalogStatusDto,
  ) {
    return {
      data: await this.routes.setStatus(actor, id, dto.isActive),
      message: 'Estado actualizado',
    };
  }

  @Put(':id/operations')
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Reemplaza todas las operaciones atómicamente' })
  async operations(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceRouteOperationsDto,
  ) {
    return {
      data: await this.routes.replaceOperations(actor, id, dto.operations),
      message: 'Operaciones actualizadas',
    };
  }
}
