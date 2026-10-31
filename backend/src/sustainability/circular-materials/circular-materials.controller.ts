import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Authenticated,
  type AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../auth/access-policy.js';
import { SESSION_COOKIE } from '../../auth/session-cookie.js';
import { SetCatalogStatusDto } from '../../common/catalog.dto.js';
import { RoleCode } from '../../generated/prisma/client.js';
import {
  CircularMaterialsQueryDto,
  CreateCircularMaterialDto,
  UpdateCircularMaterialDto,
} from './circular-materials.dto.js';
import { CircularMaterialsService } from './circular-materials.service.js';

@ApiTags('Sustainability · Circular materials')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('sustainability/circular-materials')
export class CircularMaterialsController {
  constructor(private readonly profiles: CircularMaterialsService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Lista materiales circulares configurados' })
  list(@Query() query: CircularMaterialsQueryDto) {
    return this.profiles.list(query);
  }

  @Post()
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'Configura un material circular medido desde el ledger' })
  async create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateCircularMaterialDto) {
    return { data: await this.profiles.create(actor, dto), message: 'Perfil circular creado' };
  }

  @Patch(':id')
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'Actualiza nombre visible o unidad de reporte compatible' })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCircularMaterialDto,
  ) {
    return {
      data: await this.profiles.update(actor, id, dto),
      message: 'Perfil circular actualizado',
    };
  }

  @Patch(':id/status')
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'Activa o desactiva un perfil circular' })
  async status(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetCatalogStatusDto,
  ) {
    return {
      data: await this.profiles.setStatus(actor, id, dto.isActive),
      message: 'Estado actualizado',
    };
  }
}
