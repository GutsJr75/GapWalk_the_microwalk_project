import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Preserves NestJS's default HttpException response body and adds the
 * `requestId` so support can correlate a user-reported error with server logs.
 * Non-HTTP (unexpected) errors are left to the framework's default handler,
 * which still carries the `X-Request-ID` response header set by the middleware.
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const status = exception.getStatus();
    const body = exception.getResponse();

    const base =
      typeof body === 'string'
        ? { statusCode: status, message: body }
        : (body as Record<string, unknown>);

    response.status(status).json({
      ...base,
      ...(request?.id ? { requestId: request.id } : {}),
    });
  }
}
