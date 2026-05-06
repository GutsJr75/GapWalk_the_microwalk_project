import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const forwardedIp =
      Array.isArray(req.ips) && req.ips.length > 0 ? req.ips[0] : undefined;
    return forwardedIp ?? req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  }
}
