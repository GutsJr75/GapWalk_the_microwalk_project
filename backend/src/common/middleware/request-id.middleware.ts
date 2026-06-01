import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-ID';

/**
 * Attaches a stable request id to every request and echoes it back in the
 * `X-Request-ID` response header (including on error responses). Reuses an
 * inbound `X-Request-ID` if a proxy/client already set one, so a single id can
 * be traced end-to-end through support logs.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    const requestId =
      (typeof incoming === 'string' && incoming.trim()) || randomUUID();

    (req as Request & { id: string }).id = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
