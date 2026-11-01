import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ALLOW_PENDING_PASSWORD_CHANGE, type AuthenticatedRequest } from '../access-policy.js';

export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

/**
 * Mientras mustChangePassword sea true, solo se permiten las rutas marcadas con
 * @AllowPendingPasswordChange() (me, change-password y logout) y las públicas.
 *
 * Vive en el backend por la regla 1 de CLAUDE.md: si solo lo aplicara el
 * frontend, quien conoce la contraseña temporal —el propio administrador—
 * podría usarla contra la API y actuar como ese usuario (ADR 009).
 */
@Injectable()
export class PasswordChangeRequiredGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    // Sin usuario la ruta es pública: JwtAuthGuard ya rechazó cualquier otra.
    if (!user?.mustChangePassword) {
      return true;
    }
    const allowed = this.reflector.get<boolean | undefined>(
      ALLOW_PENDING_PASSWORD_CHANGE,
      context.getHandler(),
    );
    if (allowed) {
      return true;
    }
    throw new ForbiddenException(
      'Debes cambiar tu contraseña antes de continuar',
      PASSWORD_CHANGE_REQUIRED,
    );
  }
}
