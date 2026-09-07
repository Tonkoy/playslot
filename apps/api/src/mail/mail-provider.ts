import type { ServerEnv } from '@playslot/config';
import { ConsoleMailProvider } from './console.provider';
import { ResendMailProvider } from './resend.provider';
import { SendGridMailProvider } from './sendgrid.provider';

/**
 * Mail transport adapter (spec §19). The provider is the only transport seam:
 * MailService's templated helpers all funnel through `send()`, so swapping
 * Resend for SendGrid (or the dev console) never touches template copy or
 * callers. Mirrors the payments PaymentProvider factory (see
 * ../payments/payment-provider.ts) — Resend/SendGrid behind one interface, a
 * console fallback when no key is configured.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface MailProvider {
  readonly name: string;
  send(input: SendEmailInput): Promise<void>;
}

export const MAIL_PROVIDER = 'MAIL_PROVIDER';

/**
 * Pick the transport from env: an explicit MAIL_PROVIDER wins; otherwise
 * auto-select by which API key is present (SendGrid, then Resend), falling back
 * to the console logger. Resend stays the default when only a Resend key is set,
 * so existing deploys are unaffected.
 */
export function createMailProvider(env: ServerEnv): MailProvider {
  const explicit = env.MAIL_PROVIDER;
  if (explicit === 'sendgrid') return new SendGridMailProvider(env);
  if (explicit === 'resend') return new ResendMailProvider(env);
  if (explicit === 'console') return new ConsoleMailProvider();

  if (env.SENDGRID_API_KEY) return new SendGridMailProvider(env);
  if (env.RESEND_API_KEY) return new ResendMailProvider(env);
  return new ConsoleMailProvider();
}
