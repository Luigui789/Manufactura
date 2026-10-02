import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443' };

/**
 * Protección de origen para peticiones que modifican estado (ADR 008).
 *
 * Basada en Origin y Fetch Metadata (Sec-Fetch-Site), alineada con el enfoque
 * que documenta NestJS 12.1 para enableCsrfProtection(); el proyecto usa
 * 12.0.4 y no se actualiza el framework para obtenerla. No copia la
 * implementación del framework: su comportamiento lo fijan las pruebas.
 *
 * El único origen de confianza es FRONTEND_URL, que llega como same-site en
 * desarrollo (localhost:5173 → localhost:3000).
 */
@Injectable()
export class CrossOriginProtectionGuard implements CanActivate {
  private readonly trustedOrigins: ReadonlySet<string>;

  constructor(config: ConfigService) {
    this.trustedOrigins = new Set([new URL(config.getOrThrow<string>('FRONTEND_URL')).origin]);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (isAllowedRequest(request, this.trustedOrigins)) {
      return true;
    }
    throw new ForbiddenException('Origen no permitido para esta operación');
  }
}

export function isAllowedRequest(
  request: Pick<Request, 'method' | 'headers'>,
  trustedOrigins: ReadonlySet<string>,
): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    return true;
  }

  const origin = headerValue(request.headers.origin);
  const fetchSite = headerValue(request.headers['sec-fetch-site'])?.toLowerCase();

  if (fetchSite !== undefined) {
    if (fetchSite === 'same-origin' || fetchSite === 'none') {
      return true;
    }
    return origin !== undefined && trustedOrigins.has(origin);
  }

  if (origin === undefined) {
    // Sin cabeceras de navegador: no es una petición de un navegador.
    return true;
  }
  if (originMatchesHost(origin, headerValue(request.headers.host))) {
    return true;
  }
  return trustedOrigins.has(origin);
}

function originMatchesHost(origin: string, host: string | undefined): boolean {
  if (!host) {
    return false;
  }
  try {
    const url = new URL(origin);
    // URL ya omite el puerto por defecto; el Host puede traerlo explícito.
    const normalizedHost = host.toLowerCase().replace(`:${DEFAULT_PORTS[url.protocol]}`, '');
    return url.host.toLowerCase() === normalizedHost;
  } catch {
    // "null" u otro valor que no es URL.
    return false;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
