import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Authenticated } from '../../auth/access-policy.js';
import { SESSION_COOKIE } from '../../auth/session-cookie.js';
import { LotsQueryDto } from './dto/lots-query.dto.js';
import { LotsService } from './lots.service.js';

@ApiTags('Inventory Lots')
@ApiCookieAuth(SESSION_COOKIE)
@ApiResponse({ status: 401, description: 'Sin sesión válida' })
@ApiResponse({ status: 400, description: 'Filtros o paginación inválidos' })
@Controller('inventory/lots')
export class LotsController {
  constructor(private readonly lots: LotsService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Lista lotes con filtros y existencia calculada desde movimientos' })
  @ApiOkResponse({ description: 'Lotes paginados' })
  list(@Query() query: LotsQueryDto) {
    return this.lots.list(query);
  }

  @Get(':id')
  @Authenticated()
  @ApiOperation({ summary: 'Consulta detalle, saldos por almacén e historial de un lote' })
  @ApiOkResponse({ description: 'Detalle del lote' })
  @ApiResponse({ status: 404, description: 'Lote no encontrado' })
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.lots.get(id);
  }
}
