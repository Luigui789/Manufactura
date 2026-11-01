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
  CreateEmissionFactorDto,
  EmissionFactorsQueryDto,
  UpdateEmissionFactorDto,
} from './emission-factors.dto.js';
import { EmissionFactorsService } from './emission-factors.service.js';

@ApiTags('Sustainability · Emission factors')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('sustainability/emission-factors')
export class EmissionFactorsController {
  constructor(private readonly factors: EmissionFactorsService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Lista factores de emisión documentados' })
  list(@Query() query: EmissionFactorsQueryDto) {
    return this.factors.list(query);
  }

  @Get(':id')
  @Authenticated()
  @ApiOperation({ summary: 'Consulta un factor de emisión con su fuente' })
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.factors.get(id), message: 'Factor encontrado' };
  }

  @Post()
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'Crea un factor con fuente obligatoria y coeficiente no negativo' })
  async create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateEmissionFactorDto) {
    return { data: await this.factors.create(actor, dto), message: 'Factor creado' };
  }

  @Patch(':id')
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'Actualiza nombre, coeficiente y fuente; la identidad no cambia' })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEmissionFactorDto,
  ) {
    return { data: await this.factors.update(actor, id, dto), message: 'Factor actualizado' };
  }

  @Patch(':id/status')
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'Activa o desactiva un factor; los históricos se conservan' })
  async status(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetCatalogStatusDto,
  ) {
    return {
      data: await this.factors.setStatus(actor, id, dto.isActive),
      message: 'Estado actualizado',
    };
  }
}
