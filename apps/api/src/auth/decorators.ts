import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@playslot/db';
import type { AuthenticatedUser } from './auth.types';

/** Marks a route as public — the global JwtAuthGuard skips authentication. */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Requires the user to hold at least one of these platform-level roles. */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Requires club membership with one of these roles for the :clubId param. */
export const CLUB_ROLES_KEY = 'clubRoles';
export const ClubRoles = (...roles: Role[]) => SetMetadata(CLUB_ROLES_KEY, roles);

/** Injects the authenticated user (or a field of it) into a handler param. */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = req.user;
    return field && user ? user[field] : user;
  },
);
