import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../../prisma/prisma.service.js';
import { ACCESS_POLICY, type AccessPolicy, type AuthenticatedRequest } from '../access-policy.js';
import { SESSION_COOKIE } from '../session-cookie.js';

export type JwtPayload = { sub: string; ver: number };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Autenticación de cada petición no pública (ADR 008).
 *
 * Verifica la firma HS256 y la expiración, y después carga al usuario de la
 * base: isActive, token_version y el rol actual mandan siempre. El rol nunca se
 * lee del token. Ningún detalle de la verificación llega al cliente.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS_POLICY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (policy?.kind === 'public') {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[SESSION_COOKIE];
    if (!token) {
      throw new UnauthorizedException('Sesión requerida');
    }

    const payload = await this.verify(token);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        mustChangePassword: true,
        tokenVersion: true,
        role: { select: { code: true } },
      },
    });
    if (!user || !user.isActive || user.tokenVersion !== payload.ver) {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }

    request.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.code,
      mustChangePassword: user.mustChangePassword,
    };
    return true;
  }

  private async verify(token: string): Promise<JwtPayload> {
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }
    if (!isJwtPayload(payload)) {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }
    return payload;
  }
}

function isJwtPayload(value: unknown): value is JwtPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { sub, ver } = value as Record<string, unknown>;
  return (
    typeof sub === 'string' &&
    UUID_PATTERN.test(sub) &&
    typeof ver === 'number' &&
    Number.isInteger(ver) &&
    ver >= 0
  );
}
