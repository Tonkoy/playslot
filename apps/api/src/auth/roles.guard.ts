import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@playslot/db';
import { AppException } from '../common/app-exception';
import type { AuthenticatedUser } from './auth.types';
import { ROLES_KEY } from './decorators';

/**
 * Global platform-role check (spec §11). Routes annotated with @Roles(...) require
 * the user to hold at least one listed role. Unannotated routes pass through.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) throw new AppException('unauthenticated');

    if (!user.roles.some((r) => required.includes(r))) {
      throw new AppException('forbidden');
    }
    return true;
  }
}
