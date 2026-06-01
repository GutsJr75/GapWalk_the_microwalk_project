import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restrict an endpoint to specific roles (e.g. internal admin tooling).
 * Usage: @Roles(UserRole.admin)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
