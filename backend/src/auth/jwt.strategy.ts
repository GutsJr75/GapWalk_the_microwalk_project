import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/interfaces';
import { FirebaseAdminService } from './firebase-admin.service';

@Injectable()
export class JwtStrategy {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseAdmin: FirebaseAdminService,
  ) {}

  async validateIdToken(idToken: string): Promise<JwtPayload & { userId: string }> {
    const decoded = await this.firebaseAdmin.getAuth().verifyIdToken(idToken);
    const payload: JwtPayload = {
      sub: decoded.uid,
      uid: decoded.uid,
      firebaseUid: decoded.uid,
      email: decoded.email,
      email_verified: decoded.email_verified,
      name: typeof decoded.name === 'string' ? decoded.name : undefined,
      picture: typeof decoded.picture === 'string' ? decoded.picture : undefined,
      providerId: decoded.firebase?.sign_in_provider,
    };

    let user = await this.prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
    });

    if (!user) {
      this.logger.log(`Auto-registering new user: ${decoded.uid}`);
      user = await this.prisma.user.create({
        data: {
          firebaseUid: decoded.uid,
          email: decoded.email,
          displayName:
            (typeof decoded.name === 'string' ? decoded.name : null) ?? null,
        },
      });
    } else {
      const incomingName = typeof decoded.name === 'string' ? decoded.name : null;
      const emailChanged = decoded.email && user.email !== decoded.email;
      const nameChanged = incomingName && user.displayName !== incomingName;
      if (emailChanged || nameChanged) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            ...(emailChanged ? { email: decoded.email } : {}),
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
