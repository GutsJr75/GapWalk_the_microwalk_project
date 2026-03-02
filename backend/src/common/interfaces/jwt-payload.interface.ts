import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string; // Auth0 subject
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
  roles?: UserRole[];
  [key: string]: unknown;
}

export interface RequestWithUser extends Request {
  user: JwtPayload & { userId: string };
}
