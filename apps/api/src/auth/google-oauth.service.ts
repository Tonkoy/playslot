import { Inject, Injectable } from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import { AppException } from '../common/app-exception';
import { SERVER_ENV } from '../config/app-config.module';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export interface GoogleProfile {
  providerAccountId: string; // Google `sub` (stable)
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

/**
 * Server-side Google OAuth 2.0 authorization-code flow (spec §13). We exchange
 * the code over TLS at Google's token endpoint, then read the profile from the
 * OpenID userinfo endpoint with the returned access token — so no local JWT
 * signature verification is needed. OAuth accounts are pre-verified.
 */
@Injectable()
export class GoogleOAuthService {
  constructor(@Inject(SERVER_ENV) private readonly env: ServerEnv) {}

  isConfigured(): boolean {
    return Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET);
  }

  private redirectUri(): string {
    // Global prefix is "api"; this must match the Authorized redirect URI in the
    // Google Cloud console.
    return `${this.env.API_BASE_URL.replace(/\/$/, '')}/api/auth/google/callback`;
  }

  getAuthorizationUrl(state: string): string {
    this.assertConfigured();
    const params = new URLSearchParams({
      client_id: this.env.GOOGLE_CLIENT_ID!,
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'select_account',
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<GoogleProfile> {
    this.assertConfigured();

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.env.GOOGLE_CLIENT_ID!,
        client_secret: this.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      throw new AppException('unauthenticated', undefined, 'Google token exchange failed');
    }
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) {
      throw new AppException('unauthenticated', undefined, 'Google token exchange failed');
    }

    const infoRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) {
      throw new AppException('unauthenticated', undefined, 'Google userinfo failed');
    }
    const info = (await infoRes.json()) as {
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };
    if (!info.sub || !info.email) {
      throw new AppException('unauthenticated', undefined, 'Google account missing email');
    }

    return {
      providerAccountId: info.sub,
      email: info.email.toLowerCase(),
      emailVerified: info.email_verified ?? true,
      name: info.name ?? info.email,
      picture: info.picture,
    };
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new AppException('policy_violation', undefined, 'Google sign-in is not configured');
    }
  }
}
