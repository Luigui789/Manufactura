import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { HealthResponseDto } from './dto/health-response.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Verifica la conectividad del servicio y de la base de datos',
    description:
      'Comprueba la cadena NestJS -> Prisma -> PostgreSQL ejecutando SELECT 1. ' +
      'Devuelve 503 si la base de datos no responde, para que el fallo sea visible ' +
      'en el codigo HTTP y no solo en el cuerpo de la respuesta.',
  })
  @ApiResponse({
    status: 200,
    description: 'El servicio y la base de datos responden',
    type: HealthResponseDto,
  })
  @ApiResponse({ status: 503, description: 'La base de datos no responde' })
  async check(): Promise<HealthResponseDto> {
    const data = await this.healthService.check();

    if (data.status !== 'ok') {
      throw new ServiceUnavailableException({
        data,
        message: 'La base de datos no responde',
      });
    }

    return { data, message: 'Servicio operativo' };
  }
}
