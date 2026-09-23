import { ApiProperty } from '@nestjs/swagger';

export class HealthCheckDto {
  @ApiProperty({ enum: ['ok', 'error'], example: 'ok' })
  status: 'ok' | 'error';

  @ApiProperty({ enum: ['up', 'down'], example: 'up', description: 'Estado de PostgreSQL' })
  database: 'up' | 'down';

  @ApiProperty({ example: '2026-09-22T23:00:00.000Z', format: 'date-time' })
  timestamp: string;
}

/**
 * Primera concrecion del formato de respuesta acordado en el prompt maestro:
 * toda respuesta exitosa viaja como { data, message }. Los modulos de negocio
 * que vengan despues deben seguir esta misma envoltura.
 */
export class HealthResponseDto {
  @ApiProperty({ type: HealthCheckDto })
  data: HealthCheckDto;

  @ApiProperty({ example: 'Servicio operativo' })
  message: string;
}
