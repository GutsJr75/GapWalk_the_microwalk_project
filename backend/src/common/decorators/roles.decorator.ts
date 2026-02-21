import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restrict endpoint to specific roles.
 * Usage: @Roles(UserRole.researcher, UserRole.admin)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
