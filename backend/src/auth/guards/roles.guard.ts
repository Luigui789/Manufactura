import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ACCESS_POLICY, type AccessPolicy, type AuthenticatedRequest } from '../access-policy.js';

/**
 * Autorización por políticas declarativas (ADR 010).
 *
 * Denegación por defecto: una ruta sin @Public(), @Authenticated() ni @Roles()
 * responde 403 y deja un error en el log. Olvidar el decorador cierra la ruta.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS_POLICY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!policy) {
      this.logger.error(
        `Ruta sin política de acceso: ${context.getClass().name}.${context.getHandler().name}`,
      );
      throw new ForbiddenException('No tienes permiso para esta operación');
    }
    if (policy.kind === 'public' || policy.kind === 'authenticated') {
      return true;
    }

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (user && policy.roles.includes(user.role)) {
      return true;
    }
    throw new ForbiddenException('No tienes permiso para esta operación');
  }
}
