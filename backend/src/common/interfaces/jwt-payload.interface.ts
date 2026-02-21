import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string; // Auth0 subject
  email?: string;
  roles?: UserRole[];
  [key: string]: unknown;
}

export interface RequestWithUser extends Request {
  user: JwtPayload & { userId: string };
}
