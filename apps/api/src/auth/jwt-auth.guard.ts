import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { type AuthenticatedUser, type JwtPayload, SESSION_COOKIE } from './auth.types';
import { IS_PUBLIC_KEY } from './decorators';

/**
 * Global guard: authenticates from the session cookie or a Bearer token, then
 * loads the user fresh from the DB so roles / verification status are never
 * stale (spec §11: authorization is decided server-side on every request).
 * Public routes opt out via @Public().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = this.extractToken(req);

    if (!token) {
      if (isPublic) return true;
      throw new AppException('unauthenticated');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      if (isPublic) return true;
      throw new AppException('unauthenticated');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { roles: true },
    });
    if (!user) {
      if (isPublic) return true;
      throw new AppException('unauthenticated');
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
      emailVerified: user.emailVerifiedAt !== null,
      roles: user.roles.map((r) => r.role),
    };
    return true;
  }

  private extractToken(req: Request): string | undefined {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const fromCookie = cookies?.[SESSION_COOKIE];
    if (fromCookie) return fromCookie;
    const auth = req.header('authorization');
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    return undefined;
  }
}
