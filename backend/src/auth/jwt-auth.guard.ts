import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtStrategy } from './jwt.strategy';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly jwtStrategy: JwtStrategy) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & {
      user?: Record<string, unknown>;
    }>();
    const authHeader = request.headers.authorization ?? '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    try {
      request.user = await this.jwtStrategy.validateIdToken(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Firebase token verification failed: ${message}`);
      const clientMessage =
        process.env.NODE_ENV === 'production'
          ? 'Invalid or expired Firebase ID token'
          : `Invalid or expired Firebase ID token: ${message}`;
      throw new UnauthorizedException(clientMessage);
    }

    return true;
  }
}
