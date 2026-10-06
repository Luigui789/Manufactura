import { type MiddlewareConsumer, Module, type NestModule, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { RequestContextMiddleware } from './common/request-context/request-context.js';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { InventoryModule } from './inventory/inventory.module.js';

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
    AuditModule,
    AuthModule,
    UsersModule,
    HealthModule,
    InventoryModule,
  ],
  providers: [
    // Unica configuracion efectiva del pipe global. Al registrarlo aqui y no en
    // main.ts, las pruebas e2e usan exactamente la misma validacion que
    // produccion. whitelist descarta lo no declarado en el DTO y
    // forbidNonWhitelisted lo rechaza explicitamente en lugar de ignorarlo.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // NestJS 12.0.4 no lee cookies por si mismo (las nativas llegan en 12.1).
    consumer.apply(cookieParser(), RequestContextMiddleware).forRoutes('*path');
  }
}
