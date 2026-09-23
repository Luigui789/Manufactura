import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

/**
 * Solo existen los modulos que hacen algo real en esta etapa.
 *
 * Los dominios de negocio (Compras, Inventario, Produccion, Ventas) estan
 * descritos en docs/architecture.md y se materializaran cuando empiece su
 * funcionalidad: ComprasModule nacera con la rama feature/purchases, no antes.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // El .env vive en la raiz del monorepo y los procesos del backend se
      // ejecutan desde backend/, de ahi el '../'. El segundo valor permite un
      // .env local si algun integrante lo necesita.
      envFilePath: ['../.env', '.env'],
      validate: validateEnv,
      cache: true,
    }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
