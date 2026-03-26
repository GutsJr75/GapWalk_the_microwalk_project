import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string; // Firebase UID
  uid?: string;
  firebaseUid?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
  providerId?: string;
  roles?: UserRole[];
  [key: string]: unknown;
}

export interface RequestWithUser extends Request {
  user: JwtPayload & { userId: string };
}
