import { Global, Inject, Injectable, Module } from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import { SERVER_ENV } from '../config/app-config.module';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Cloudflare Turnstile bot check (spec §3/§13) for register / booking. Degrades
 * to a no-op (allows the request) when TURNSTILE_SECRET_KEY is unset, so dev and
 * tests run without a key; once configured, an invalid/missing token is rejected.
 */
@Injectable()
export class TurnstileService {
  constructor(@Inject(SERVER_ENV) private readonly env: ServerEnv) {}

  isConfigured(): boolean {
    return Boolean(this.env.TURNSTILE_SECRET_KEY);
  }

  async verify(token?: string, ip?: string): Promise<boolean> {
    if (!this.isConfigured()) return true;
    if (!token) return false;
    try {
      const res = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: this.env.TURNSTILE_SECRET_KEY!,
          response: token,
          ...(ip ? { remoteip: ip } : {}),
        }),
      });
      const data = (await res.json()) as { success?: boolean };
      return data.success === true;
    } catch {
      return false;
    }
  }
}

@Global()
@Module({
  providers: [TurnstileService],
  exports: [TurnstileService],
})
export class SecurityModule {}
