import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@playslot/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/app-exception';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from './auth.types';
import { ClubMembershipGuard } from './club-membership.guard';

function ctx(clubId: string, user: Partial<AuthenticatedUser> | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ params: { clubId }, user }) }),
  } as unknown as ExecutionContext;
}

describe('ClubMembershipGuard (tenant isolation)', () => {
  const findFirst = vi.fn();
  const prisma = { clubMember: { findFirst } } as unknown as PrismaService;
  const reflector = { getAllAndOverride: () => ['CLUB_ADMIN'] as Role[] } as unknown as Reflector;
  const guard = new ClubMembershipGuard(reflector, prisma);

  beforeEach(() => findFirst.mockReset());

  it('lets a platform admin bypass membership', async () => {
    await expect(guard.canActivate(ctx('1', { id: 1, roles: ['PLATFORM_ADMIN'] }))).resolves.toBe(
      true,
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('allows a member with the required club role', async () => {
    findFirst.mockResolvedValue({ id: 10 });
    await expect(guard.canActivate(ctx('5', { id: 2, roles: ['CLUB_ADMIN'] }))).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clubId: 5, userId: 2 }) }),
    );
  });

  it('forbids a non-member (Club A user acting on Club B)', async () => {
    findFirst.mockResolvedValue(null);
    await expect(guard.canActivate(ctx('99', { id: 3, roles: ['CLUB_ADMIN'] }))).rejects.toThrow(
      AppException,
    );
  });

  it('rejects an invalid club id', async () => {
    await expect(guard.canActivate(ctx('abc', { id: 3, roles: ['CLUB_ADMIN'] }))).rejects.toThrow(
      AppException,
    );
  });

  it('rejects an unauthenticated request', async () => {
    await expect(guard.canActivate(ctx('1', undefined))).rejects.toThrow(AppException);
  });
});
