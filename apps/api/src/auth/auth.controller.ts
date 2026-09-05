import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
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
import { AuthService } from './auth.service';
import { type AuthenticatedUser, SESSION_COOKIE, SESSION_TTL_SECONDS } from './auth.types';
import { CurrentUser, Public } from './decorators';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
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
  logout(@Res({ passthrough: true }) res: Response, @Req() req: Request) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { message: t('auth.logged_out', localeOf(req)) };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const fresh = await this.auth.getMe(user.id);
    if (!fresh) throw new AppException('unauthenticated');
    return { user: fresh };
  }

  @Public()
  @Post('verify-email')
  async verifyEmail(
    @Body(new ZodBody(verifyEmailSchema)) body: { token: string },
    @Req() req: Request,
  ) {
    await this.auth.verifyEmail(body.token);
    return { message: t('auth.email_verified', localeOf(req)) };
  }

  @Public()
  @Post('resend-verification')
  async resend(
    @Body(new ZodBody(resendVerificationSchema)) body: { email: string },
    @Req() req: Request,
  ) {
    await this.auth.resendVerification(body.email);
    return { message: t('auth.verification_sent', localeOf(req)) };
  }

  @Public()
  @Post('forgot-password')
  async forgot(
    @Body(new ZodBody(forgotPasswordSchema)) body: { email: string },
    @Req() req: Request,
  ) {
    await this.auth.forgotPassword(body.email);
    return { message: t('auth.reset_sent', localeOf(req)) };
  }

  @Public()
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
