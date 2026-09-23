import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import type { HealthCheckDto } from './dto/health-response.dto.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ejecuta la consulta mas barata posible contra PostgreSQL. No comprueba la
   * existencia de ninguna tabla a proposito: en esta etapa el esquema no tiene
   * modelos de negocio, y el objetivo es validar la cadena completa
   * NestJS -> Prisma -> PostgreSQL, no el modelo de datos.
   */
  async check(): Promise<HealthCheckDto> {
    const timestamp = new Date().toISOString();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up', timestamp };
    } catch (error) {
      this.logger.error(
        'PostgreSQL no responde',
        error instanceof Error ? error.stack : String(error),
      );
      return { status: 'error', database: 'down', timestamp };
    }
  }
}
