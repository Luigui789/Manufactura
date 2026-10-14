import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Authenticated } from '../../auth/access-policy.js';
import { SESSION_COOKIE } from '../../auth/session-cookie.js';
import { StockQueryDto } from './dto/stock-query.dto.js';
import { StockQueryService } from './stock-query.service.js';

@ApiTags('Inventory Stock')
@ApiCookieAuth(SESSION_COOKIE)
@ApiResponse({ status: 400, description: 'Filtros o paginación inválidos' })
@ApiResponse({ status: 401, description: 'Sin sesión válida' })
@ApiResponse({ status: 403, description: 'Acceso denegado' })
@Controller('inventory/stock')
export class StockController {
  constructor(private readonly stockQuery: StockQueryService) {}

  @Get()
  @Authenticated()
  @ApiOperation({
    summary: 'Lista las existencias físicas por producto y almacén',
    description:
      'Incluye lotes liberados, en cuarentena y rechazados. hasStock=true selecciona saldos físicos mayores que cero; false u omitido incluye también saldos cero existentes. El total corresponde a los filtros aplicados.',
  })
  @ApiOkResponse({ description: 'Listado paginado de existencias' })
  list(@Query() query: StockQueryDto) {
    return this.stockQuery.list(query);
  }
}
