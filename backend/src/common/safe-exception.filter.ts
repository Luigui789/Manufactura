import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { currentRequestContext } from './request-context/request-context.js';

/** Unexpected driver errors may embed connection strings or Prisma write arguments. */
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeExceptionFilter.name);

  constructor(private readonly adapter: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    let response: HttpException;
    if (exception instanceof HttpException) {
      response = exception; // Preserve the existing 400/401/403/404/409/422/503 contracts.
    } else {
      this.logger.error(
        `Unexpected server error; requestId=${currentRequestContext()?.requestId ?? 'unavailable'}`,
      );
      response = new HttpException({ statusCode: 500, message: 'Internal server error' }, 500);
    }
    new BaseExceptionFilter(this.adapter.httpAdapter).catch(response, host);
  }
}
