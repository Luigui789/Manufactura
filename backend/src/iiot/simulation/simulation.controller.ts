import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated, Roles } from '../../auth/access-policy.js';
import { SESSION_COOKIE } from '../../auth/session-cookie.js';
import { RoleCode } from '../../generated/prisma/client.js';
import { StartSimulationDto } from './simulation.dto.js';
import { SimulationService } from './simulation.service.js';

@ApiTags('IIoT Demo')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('iiot/production-orders')
export class SimulationController {
  constructor(private readonly simulations: SimulationService) {}

  @Get(':id/simulation')
  @Authenticated()
  @ApiOperation({ summary: 'Consulta el estado de la prueba IIoT de demostración' })
  async status(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.simulations.status(id), message: 'Prueba IIoT consultada' };
  }

  @Post(':id/simulation')
  @HttpCode(202)
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({
    summary: 'Ejecuta el simulador MQTT en una OP en curso, sin decidir producción o Calidad',
  })
  async start(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: StartSimulationDto) {
    return { data: await this.simulations.start(id, dto), message: 'Prueba IIoT iniciada' };
  }
}
