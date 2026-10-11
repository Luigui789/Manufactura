import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { BomsService } from './boms.service.js';
import { BomsQueryDto } from './dto/boms-query.dto.js';
import {
  CalculateBomDto,
  CreateBomDto,
  CreateBomVersionDto,
  UpdateBomDto,
} from './dto/boms.dto.js';

@ApiTags('Production BOMs')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('production/boms')
export class BomsController {
  constructor(private readonly boms: BomsService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Lista fórmulas de producción' })
  list(@Query() query: BomsQueryDto) {
    return this.boms.list(query);
  }

  @Get(':id')
  @Authenticated()
  @ApiOperation({ summary: 'Consulta fórmula y versiones históricas' })
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.boms.get(id), message: 'Fórmula encontrada' };
  }

  @Post()
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Crea la cabecera de una fórmula' })
  async create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateBomDto) {
    return { data: await this.boms.create(actor, dto), message: 'Fórmula creada' };
  }

  @Patch(':id')
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Cambia el nombre de una fórmula' })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBomDto,
  ) {
    return { data: await this.boms.update(actor, id, dto), message: 'Fórmula actualizada' };
  }

  @Patch(':id/status')
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Activa o desactiva una fórmula sin alterar sus versiones' })
  async status(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetCatalogStatusDto,
  ) {
    return {
      data: await this.boms.setStatus(actor, id, dto.isActive),
      message: 'Estado actualizado',
    };
  }

  @Post(':id/versions')
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Crea una versión inmutable con sus componentes' })
  async version(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateBomVersionDto,
  ) {
    return { data: await this.boms.createVersion(actor, id, dto), message: 'Versión creada' };
  }

  @Post(':id/versions/:versionId/activate')
  @HttpCode(200)
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Selecciona la única versión activa de una fórmula' })
  async activate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
  ) {
    return {
      data: await this.boms.activateVersion(actor, id, versionId),
      message: 'Versión activada',
    };
  }

  @Post(':id/versions/:versionId/calculate')
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({ summary: 'Calcula requerimientos exactos sin escribir inventario' })
  async calculate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Body() dto: CalculateBomDto,
  ) {
    return {
      data: await this.boms.calculate(id, versionId, dto.quantityPlanned),
      message: 'Requerimientos calculados',
    };
  }
}
