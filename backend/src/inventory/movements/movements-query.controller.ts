import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Authenticated } from '../../auth/access-policy.js';
import { SESSION_COOKIE } from '../../auth/session-cookie.js';
import { MovementsQueryDto } from './dto/movements-query.dto.js';
import { MovementQueryService } from './movement-query.service.js';

@ApiTags('Inventory Movements')
@ApiCookieAuth(SESSION_COOKIE)
@ApiResponse({ status: 400, description: 'Filtros o paginación inválidos' })
@ApiResponse({ status: 401, description: 'Sin sesión válida' })
@ApiResponse({ status: 403, description: 'Acceso denegado' })
@Controller('inventory/movements')
export class MovementsQueryController {
  constructor(private readonly movements: MovementQueryService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Lista movimientos de inventario con filtros' })
  @ApiOkResponse({ description: 'Listado paginado de movimientos' })
  list(@Query() query: MovementsQueryDto) {
    return this.movements.list(query);
  }
}
