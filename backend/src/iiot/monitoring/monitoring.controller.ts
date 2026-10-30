import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated } from '../../auth/access-policy.js';
import { SESSION_COOKIE } from '../../auth/session-cookie.js';
import { AlertsQueryDto, ReadingsQueryDto } from './dto/monitoring-query.dto.js';
import { MonitoringService } from './monitoring.service.js';

@ApiTags('IIoT Monitoring')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('iiot/production-orders')
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get(':id/overview')
  @Authenticated()
  @ApiOperation({ summary: 'Consulta resumen IIoT y últimas métricas de una OP' })
  async overview(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.monitoring.overview(id), message: 'Monitoreo IIoT consultado' };
  }

  @Get(':id/readings')
  @Authenticated()
  @ApiOperation({ summary: 'Consulta lecturas IIoT paginadas, por recordedAt descendente' })
  readings(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: ReadingsQueryDto) {
    return this.monitoring.readings(id, query);
  }

  @Get(':id/alerts')
  @Authenticated()
  @ApiOperation({ summary: 'Consulta alertas IIoT paginadas, por createdAt descendente' })
  alerts(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: AlertsQueryDto) {
    return this.monitoring.alerts(id, query);
  }
}
