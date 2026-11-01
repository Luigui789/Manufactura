import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Authenticated } from '../../../auth/access-policy.js';
import { SESSION_COOKIE } from '../../../auth/session-cookie.js';
import { DashboardQueryDto } from './dashboard-query.dto.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('Quality Dashboard')
@ApiCookieAuth(SESSION_COOKIE)
@ApiResponse({ status: 400, description: 'Fechas, rango o producto inválidos' })
@ApiResponse({ status: 404, description: 'Producto no encontrado' })
@ApiResponse({ status: 401, description: 'Sin sesión válida' })
@Controller('production/quality/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Consulta estado actual y actividad agregada de calidad' })
  async get(@Query() query: DashboardQueryDto) {
    return { data: await this.dashboard.get(query), message: 'Dashboard de calidad consultado' };
  }
}
