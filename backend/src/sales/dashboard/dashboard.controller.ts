import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Authenticated } from '../../auth/access-policy.js';
import { SESSION_COOKIE } from '../../auth/session-cookie.js';
import { DashboardQueryDto } from './dashboard-query.dto.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('Sales Dashboard')
@ApiCookieAuth(SESSION_COOKIE)
@ApiResponse({ status: 400, description: 'Fechas, rango o cliente inválidos' })
@ApiResponse({ status: 404, description: 'Cliente no encontrado' })
@ApiResponse({ status: 401, description: 'Sin sesión válida' })
@Controller('sales/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Consulta pipeline actual y actividad agregada de ventas' })
  async get(@Query() query: DashboardQueryDto) {
    return { data: await this.dashboard.get(query), message: 'Dashboard de ventas consultado' };
  }
}
