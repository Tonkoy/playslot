import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ServerEnv } from '@playslot/config';
import { type RegisterInput, type LoginInput } from '@playslot/contracts';
import { Role, type User, VerificationPurpose } from '@playslot/db';
import { AppException } from '../common/app-exception';
import { type ApiLocale, normalizeLocale, t } from '../common/i18n';
import { SERVER_ENV } from '../config/app-config.module';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { type AuthenticatedUser, SESSION_TTL_SECONDS } from './auth.types';
import type { GoogleProfile } from './google-oauth.service';
import { hashPassword, verifyPassword } from './password';
import {
  EMAIL_VERIFY_TTL_MIN,
  PASSWORD_RESET_TTL_MIN,
  expiryFromNow,
  hashToken,
  issueToken,
} from './tokens';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
  ) {}

  // ── registration ──────────────────────────────────────────────────────────
  async register(input: RegisterInput): Promise<{ user: AuthenticatedUser; token: string }> {
    const email = input.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppException('validation_failed', { fields: { email: ['taken'] } }, t('auth.email_taken'));
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
        subscribed: input.subscribe ?? false,
        isVisible: input.isVisible ?? false, // GDPR: default OFF (§5)
        locale: 'bg',
        roles: { create: [{ role: Role.PLAYER }] },
        playerProfile: { create: {} },
      },
      include: { roles: true },
    });

    await this.issueAndSendVerification(user.id, email, normalizeLocale(user.locale));

    return { user: this.toAuthUser(user), token: await this.issueSession(user) };
  }

  // ── login ───────────────────────────────────────────────────────────────────
  async login(input: LoginInput): Promise<{ user: AuthenticatedUser; token: string }> {
    const email = input.email.toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: true },
    });
    // Constant-ish work + generic error to avoid user enumeration.
    const ok = user?.passwordHash
      ? await verifyPassword(user.passwordHash, input.password)
      : await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$abcdefghij$0000000000000000000000', input.password).then(() => false);

    if (!user || !ok) {
      throw new AppException('unauthenticated', undefined, t('auth.invalid_credentials'));
    }
    return { user: this.toAuthUser(user), token: await this.issueSession(user) };
  }

  // ── email verification ───────────────────────────────────────────────────────
  async verifyEmail(rawToken: string): Promise<void> {
    const token = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!token || token.purpose !== VerificationPurpose.EMAIL_VERIFY || token.usedAt) {
      throw new AppException('policy_violation', undefined, t('auth.token_invalid'));
    }
    if (token.expiresAt < new Date()) {
      throw new AppException('policy_violation', undefined, t('auth.token_expired'));
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.verificationToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Generic success regardless (no enumeration).
    if (user && user.emailVerifiedAt === null) {
      await this.issueAndSendVerification(user.id, user.email, normalizeLocale(user.locale));
    }
  }

  // ── password reset ───────────────────────────────────────────────────────────
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return; // generic success
    // Invalidate previous unused reset tokens for this user.
    await this.prisma.verificationToken.deleteMany({
      where: { userId: user.id, purpose: VerificationPurpose.PASSWORD_RESET, usedAt: null },
    });
    const { raw, hash } = issueToken();
    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        purpose: VerificationPurpose.PASSWORD_RESET,
        expiresAt: expiryFromNow(PASSWORD_RESET_TTL_MIN),
      },
    });
    const locale = normalizeLocale(user.locale);
    await this.mail.sendPasswordReset(user.email, this.link('reset-password', raw, locale), locale);
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const token = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!token || token.purpose !== VerificationPurpose.PASSWORD_RESET || token.usedAt) {
      throw new AppException('policy_violation', undefined, t('auth.token_invalid'));
    }
    if (token.expiresAt < new Date()) {
      throw new AppException('policy_violation', undefined, t('auth.token_expired'));
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: token.userId },
        data: { passwordHash: await hashPassword(newPassword) },
      }),
      this.prisma.verificationToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
      // any other outstanding reset tokens become moot
      this.prisma.verificationToken.deleteMany({
        where: {
          userId: token.userId,
          purpose: VerificationPurpose.PASSWORD_RESET,
          usedAt: null,
          id: { not: token.id },
        },
      }),
    ]);
  }

  // ── OAuth (Google) ───────────────────────────────────────────────────────────
  /**
   * Find-or-link-or-create a user from a verified OAuth profile (spec §13).
   * Matches first on the stable provider account id, then on email (linking the
   * external identity to the existing account), else creates a pre-verified user.
   */
  async upsertOAuthUser(
    provider: string,
    profile: GoogleProfile,
  ): Promise<{ user: AuthenticatedUser; token: string }> {
    const account = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId } },
      include: { user: { include: { roles: true } } },
    });
    if (account) {
      return { user: this.toAuthUser(account.user), token: await this.issueSession(account.user) };
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: profile.email },
      include: { roles: true },
    });
    if (existing) {
      await this.prisma.oAuthAccount.create({
        data: {
          userId: existing.id,
          provider,
          providerAccountId: profile.providerAccountId,
          email: profile.email,
        },
      });
      if (existing.emailVerifiedAt === null && profile.emailVerified) {
        const updated = await this.prisma.user.update({
          where: { id: existing.id },
          data: { emailVerifiedAt: new Date() },
        });
        existing.emailVerifiedAt = updated.emailVerifiedAt;
      }
      return { user: this.toAuthUser(existing), token: await this.issueSession(existing) };
    }

    const created = await this.prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name,
        emailVerifiedAt: profile.emailVerified ? new Date() : null,
        locale: 'bg',
        roles: { create: [{ role: Role.PLAYER }] },
        playerProfile: { create: {} },
        oauthAccounts: {
          create: [{ provider, providerAccountId: profile.providerAccountId, email: profile.email }],
        },
      },
      include: { roles: true },
    });
    return { user: this.toAuthUser(created), token: await this.issueSession(created) };
  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  async getMe(userId: number): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: true },
    });
    return user ? this.toAuthUser(user) : null;
  }

  private async issueAndSendVerification(
    userId: number,
    email: string,
    locale: ApiLocale,
  ): Promise<void> {
    const { raw, hash } = issueToken();
    await this.prisma.verificationToken.create({
      data: {
        userId,
        tokenHash: hash,
        purpose: VerificationPurpose.EMAIL_VERIFY,
        expiresAt: expiryFromNow(EMAIL_VERIFY_TTL_MIN),
      },
    });
    await this.mail.sendVerification(email, this.link('verify-email', raw, locale), locale);
  }

  private link(path: 'verify-email' | 'reset-password', rawToken: string, locale: ApiLocale): string {
    const base = this.env.APP_BASE_URL.replace(/\/$/, '');
    return `${base}/${locale}/auth/${path}?token=${rawToken}`;
  }

  private issueSession(user: { id: number; locale: string; roles: { role: Role }[] }): Promise<string> {
    return this.jwt.signAsync(
      { sub: user.id, roles: user.roles.map((r) => r.role), locale: user.locale },
      { expiresIn: SESSION_TTL_SECONDS },
    );
  }

  private toAuthUser(user: User & { roles: { role: Role }[] }): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
      emailVerified: user.emailVerifiedAt !== null,
      roles: user.roles.map((r) => r.role),
    };
  }
}
