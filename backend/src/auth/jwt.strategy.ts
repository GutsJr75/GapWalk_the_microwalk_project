import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/interfaces';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const domain = configService.get<string>('auth0.domain');
    const audience = configService.get<string>('auth0.audience');

    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${domain}/.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience,
      issuer: `https://${domain}/`,
      algorithms: ['RS256'],
    });
  }

  async validate(
    payload: JwtPayload,
  ): Promise<JwtPayload & { userId: string }> {
    // Find or create user from Auth0 subject
    let user = await this.prisma.user.findUnique({
      where: { auth0Sub: payload.sub },
    });

    if (!user) {
      this.logger.log(`Auto-registering new user: ${payload.sub}`);
      user = await this.prisma.user.create({
        data: {
          auth0Sub: payload.sub,
          email: payload.email,
          displayName: payload.name ?? payload.given_name ?? null,
        },
      });
    } else {
      // Keep email + displayName in sync if they changed in Auth0
      const incomingName = payload.name ?? payload.given_name ?? null;
      const emailChanged = payload.email && user.email !== payload.email;
      const nameChanged = incomingName && user.displayName !== incomingName;
      if (emailChanged || nameChanged) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            ...(emailChanged ? { email: payload.email } : {}),
            ...(nameChanged ? { displayName: incomingName } : {}),
          },
        });
      }
    }

    return {
      ...payload,
      userId: user.id,
      role: user.role,
    } as JwtPayload & { userId: string };
  }
}
