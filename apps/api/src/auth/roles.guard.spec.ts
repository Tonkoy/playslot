import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@playslot/db';
import { describe, expect, it } from 'vitest';
import { AppException } from '../common/app-exception';
import type { AuthenticatedUser } from './auth.types';
import { RolesGuard } from './roles.guard';

function ctxWith(user: Partial<AuthenticatedUser> | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardRequiring(roles: Role[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: () => roles,
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('passes through when no roles are required', () => {
    expect(guardRequiring(undefined).canActivate(ctxWith({ roles: [] }))).toBe(true);
  });

  it('allows a user holding a required role', () => {
    const guard = guardRequiring(['PLATFORM_ADMIN']);
    expect(guard.canActivate(ctxWith({ roles: ['PLATFORM_ADMIN'] }))).toBe(true);
  });

  it('forbids a user lacking every required role', () => {
    const guard = guardRequiring(['PLATFORM_ADMIN']);
    expect(() => guard.canActivate(ctxWith({ roles: ['PLAYER'] }))).toThrow(AppException);
  });

  it('rejects an unauthenticated request', () => {
    const guard = guardRequiring(['CLUB_ADMIN']);
    expect(() => guard.canActivate(ctxWith(undefined))).toThrow(AppException);
  });
});
