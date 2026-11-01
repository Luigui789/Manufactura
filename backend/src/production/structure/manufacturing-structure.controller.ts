import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated } from '../../auth/access-policy.js';
import { SESSION_COOKIE } from '../../auth/session-cookie.js';
import { ManufacturingStructureService } from './manufacturing-structure.service.js';

@ApiTags('Production Manufacturing Structure')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('production/manufacturing-structure')
export class ManufacturingStructureController {
  constructor(private readonly structure: ManufacturingStructureService) {}

  @Get(':productId')
  @Authenticated()
  @ApiOperation({
    summary: 'Consulta la estructura multinivel vigente (fórmulas, rutas y preparación)',
  })
  async get(@Param('productId', new ParseUUIDPipe()) productId: string) {
    return {
      data: await this.structure.get(productId),
      message: 'Estructura de manufactura encontrada',
    };
  }
}
