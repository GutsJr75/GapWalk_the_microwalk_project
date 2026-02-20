import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.getRequiredRoles(context);

    if (!this.hasRoleRestriction(requiredRoles)) {
      return true;
    }

    const user = this.extractUser(context);
    return this.hasRequiredRole(user, requiredRoles);
  }

  private getRequiredRoles(context: ExecutionContext): UserRole[] {
    return (
      this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || []
    );
  }

  private hasRoleRestriction(requiredRoles: UserRole[]): boolean {
    return requiredRoles.length > 0;
  }

  private extractUser(context: ExecutionContext): any {
    return context.switchToHttp().getRequest().user;
  }

  private hasRequiredRole(user: any, requiredRoles: UserRole[]): boolean {
    if (!user?.role) {
      return false;
    }
    return requiredRoles.includes(user.role);
  }
}
