import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Role } from '@playslot/db';
import type { Request } from 'express';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from './auth.types';
import { CLUB_ROLES_KEY } from './decorators';

/**
 * Strict multi-tenant isolation (golden rule §2.7). For any club-scoped route
 * (`:clubId` param) this verifies the user is an ACTIVE member of that club with
 * one of the required roles. PLATFORM_ADMIN bypasses. Club A can never act on
 * Club B — enforced here, server-side, and covered by isolation tests.
 */
@Injectable()
export class ClubMembershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) throw new AppException('unauthenticated');

    const clubId = Number(req.params.clubId);
    if (!Number.isInteger(clubId) || clubId <= 0) {
      throw new AppException('validation_failed', { params: { clubId: ['Invalid club id'] } });
    }

    if (user.roles.includes('PLATFORM_ADMIN')) return true;

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(CLUB_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const membership = await this.prisma.clubMember.findFirst({
      where: {
        clubId,
        userId: user.id,
        status: 'ACTIVE',
        ...(required && required.length > 0 ? { role: { in: required } } : {}),
      },
    });

    if (!membership) throw new AppException('forbidden', { clubId });
    return true;
  }
}
