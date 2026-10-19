import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Authenticated,
  CurrentUser,
  Roles,
  type AuthenticatedUser,
} from '../../auth/access-policy.js';
import { SESSION_COOKIE } from '../../auth/session-cookie.js';
import { RoleCode } from '../../generated/prisma/client.js';
import { InspectionDto } from './inspection.dto.js';
import { QualityService } from './quality.service.js';
import { TraceabilityService } from './traceability.service.js';

@ApiTags('Production Quality and Traceability')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('production/lots')
export class QualityController {
  constructor(
    private readonly quality: QualityService,
    private readonly trace: TraceabilityService,
  ) {}

  @Get(':id/inspection')
  @Authenticated()
  @ApiOperation({ summary: 'Consulta la inspección del lote' })
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.quality.get(id), message: 'Inspección consultada' };
  }
  @Post(':id/inspection')
  @HttpCode(201)
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Inspecciona y libera o rechaza un lote producido en cuarentena' })
  async inspect(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: InspectionDto,
  ) {
    return { data: await this.quality.inspect(actor, id, dto), message: 'Inspección registrada' };
  }
  @Get(':id/traceability')
  @Authenticated()
  @ApiOperation({ summary: 'Reconstruye trazabilidad del lote hasta recepciones y proveedores' })
  async traceability(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.trace.get(id), message: 'Trazabilidad consultada' };
  }
}
