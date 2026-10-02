import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuditModule } from '../audit/audit.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CrossOriginProtectionGuard } from './guards/cross-origin-protection.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PasswordChangeRequiredGuard } from './guards/password-change-required.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { PasswordHasherService } from './password-hasher.service.js';
import { SESSION_TTL_SECONDS } from './session-cookie.js';

/** Límite de intentos en login y cambio de contraseña: 10 por minuto e IP. */
export const AUTH_THROTTLE = { ttl: 60_000, limit: 10 };

@Module({
  imports: [
    AuditModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { algorithm: 'HS256', expiresIn: SESSION_TTL_SECONDS },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    // En memoria y local a esta instancia: reiniciar el backend reinicia el contador.
    // Una arquitectura distribuida necesitaría almacenamiento compartido.
    ThrottlerModule.forRoot([AUTH_THROTTLE]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHasherService,
    // Orden deliberado (ADR 010): origen → autenticación → cambio pendiente → autorización.
    { provide: APP_GUARD, useClass: CrossOriginProtectionGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PasswordChangeRequiredGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [PasswordHasherService],
})
export class AuthModule {}
