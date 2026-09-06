import { randomBytes } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { ServerEnv } from '@playslot/config';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@playslot/contracts';
import { AppException } from '../common/app-exception';
import { normalizeLocale, t } from '../common/i18n';
import { ZodBody } from '../common/zod-validation.pipe';
import { SERVER_ENV } from '../config/app-config.module';
import { AuthService } from './auth.service';
import { type AuthenticatedUser, SESSION_COOKIE, SESSION_TTL_SECONDS } from './auth.types';
import { CurrentUser, Public } from './decorators';
import { GoogleOAuthService } from './google-oauth.service';

const OAUTH_STATE_COOKIE = 'playslot_oauth_state';

// Tighter limit on sensitive auth endpoints (spec §20): 10 req/min/IP (relaxed
// under test). Applied per-route so /auth/me stays on the global default.
const AUTH_LIMIT = {
  default: { ttl: 60_000, limit: process.env.NODE_ENV === 'test' ? 100_000 : 10 },
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleOAuthService,
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
  ) {}

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('register')
  async register(
    @Body(new ZodBody(registerSchema)) body: import('@playslot/contracts').RegisterInput,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const { user, token } = await this.auth.register(body);
    this.setSession(res, token);
    return { user, message: t('auth.registered', localeOf(req)) };
  }

  @Public()
  @HttpCode(200)
  @Throttle(AUTH_LIMIT)
  @Post('login')
  async login(
    @Body(new ZodBody(loginSchema)) body: import('@playslot/contracts').LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.login(body);
    this.setSession(res, token);
    return { user };
  }

  @Post('logout')
  @Public()
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response, @Req() req: Request) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { message: t('auth.logged_out', localeOf(req)) };
  }

  // ── Google OAuth (server-side authorization-code flow, spec §13) ──
  @Public()
  @Get('google')
  googleStart(@Query('returnTo') returnTo: string | undefined, @Res() res: Response) {
    const state = randomBytes(16).toString('base64url');
    const safeReturn = isSafePath(returnTo) ? returnTo : '/';
    res.cookie(OAUTH_STATE_COOKIE, `${state}|${safeReturn}`, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(this.google.getAuthorizationUrl(state));
  }

  @Public()
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const raw = (req as Request & { cookies?: Record<string, string> }).cookies?.[
      OAUTH_STATE_COOKIE
    ];
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });

    const [savedState, returnTo = '/'] = (raw ?? '').split('|');
    if (!code || !state || !savedState || savedState !== state) {
      throw new AppException('unauthenticated', undefined, 'Invalid OAuth state');
    }

    const profile = await this.google.exchangeCode(code);
    const { token } = await this.auth.upsertOAuthUser('google', profile);
    this.setSession(res, token);

    const base = this.env.APP_BASE_URL.replace(/\/$/, '');
    res.redirect(`${base}${isSafePath(returnTo) ? returnTo : '/'}`);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const fresh = await this.auth.getMe(user.id);
    if (!fresh) throw new AppException('unauthenticated');
    return { user: fresh };
  }

  @Public()
  @HttpCode(200)
  @Post('verify-email')
  async verifyEmail(
    @Body(new ZodBody(verifyEmailSchema)) body: { token: string },
    @Req() req: Request,
  ) {
    await this.auth.verifyEmail(body.token);
    return { message: t('auth.email_verified', localeOf(req)) };
  }

  @Public()
  @HttpCode(200)
  @Throttle(AUTH_LIMIT)
  @Post('resend-verification')
  async resend(
    @Body(new ZodBody(resendVerificationSchema)) body: { email: string },
    @Req() req: Request,
  ) {
    await this.auth.resendVerification(body.email);
    return { message: t('auth.verification_sent', localeOf(req)) };
  }

  @Public()
  @HttpCode(200)
  @Throttle(AUTH_LIMIT)
  @Post('forgot-password')
  async forgot(
    @Body(new ZodBody(forgotPasswordSchema)) body: { email: string },
    @Req() req: Request,
  ) {
    await this.auth.forgotPassword(body.email);
    return { message: t('auth.reset_sent', localeOf(req)) };
  }

  @Public()
  @HttpCode(200)
  @Throttle(AUTH_LIMIT)
  @Post('reset-password')
  async reset(
    @Body(new ZodBody(resetPasswordSchema)) body: { token: string; password: string },
    @Req() req: Request,
  ) {
    await this.auth.resetPassword(body.token, body.password);
    return { message: t('auth.password_reset', localeOf(req)) };
  }

  private setSession(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_SECONDS * 1000,
    });
  }
}

function localeOf(req: Request) {
  return normalizeLocale(req.header('x-locale') ?? req.header('accept-language'));
}

/** Only same-site relative paths — blocks open-redirect via `//host` or absolute URLs. */
function isSafePath(path: string | undefined): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
}
