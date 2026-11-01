import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export type RequestContext = {
  requestId: string;
  ipAddress: string | null;
};

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Contexto de la petición HTTP en curso, o undefined fuera de una petición
 * (por ejemplo, en el comando admin:create).
 */
export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Genera el requestId y captura la IP al entrar la petición (ADR 005).
 *
 * El identificador lo crea siempre el servidor: un X-Request-Id entrante se
 * ignora para que nadie pueda inyectar valores en la auditoría. La IP es la del
 * socket porque `trust proxy` está desactivado; detrás de un proxy inverso hay
 * que configurarlo antes de confiar en ella.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const context: RequestContext = {
      requestId: randomUUID(),
      ipAddress: req.ip ?? null,
    };
    res.setHeader('X-Request-Id', context.requestId);
    storage.run(context, () => next());
  }
}
