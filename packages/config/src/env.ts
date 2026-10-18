import { z } from 'zod';

/**
 * Central environment schema for PlaySlot (spec §21).
 *
 * Golden rule: fail fast. Every deployable validates its env at boot; a missing
 * or malformed required variable stops the process instead of failing later at
 * an unpredictable point. Secrets never live in the repo — only in the runtime
 * environment / a secret manager.
 *
 * The schema is layered so early milestones don't need late-milestone secrets
 * (Stripe, Maps, etc.). Use {@link serverEnvSchema} on the API/worker and
 * {@link webEnvSchema} on the Next.js server; both build on {@link coreEnvSchema}.
 */

const nodeEnv = z.enum(['development', 'test', 'production']).default('development');

/** Optional string that treats "" the same as undefined (common with .env files). */
const optionalString = z
  .string()
  .transform((v) => (v === '' ? undefined : v))
  .optional();

/** Coerce a numeric env var, keeping a default when unset. */
const intWithDefault = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

export const coreEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  APP_BASE_URL: z.string().url(),
  API_BASE_URL: z.string().url(),

  // policy defaults (spec §12) — overridable per club in the DB
  HOLD_TTL_MIN: intWithDefault(10),
  MAX_ADVANCE_DAYS: intWithDefault(14),
  DEFAULT_CURRENCY: z.string().length(3).default('EUR'),
});

/**
 * Server-side (API + workers). DATABASE_URL / REDIS_URL / AUTH_SECRET are
 * required in every environment except during the earliest scaffold phase,
 * where they may be absent; callers pass `{ requireData: false }` to relax.
 */
export const serverEnvSchema = coreEnvSchema.extend({
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres')),
  REDIS_URL: optionalString,
  AUTH_SECRET: z.string().min(16),

  // auth providers (optional until wired up)
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  APPLE_CLIENT_ID: optionalString,
  APPLE_CLIENT_SECRET: optionalString,

  // bot protection
  TURNSTILE_SITE_KEY: optionalString,
  TURNSTILE_SECRET_KEY: optionalString,

  // payments (required from Phase 7)
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  STRIPE_CONNECT_CLIENT_ID: optionalString,

  // email / storage / maps / observability
  RESEND_API_KEY: optionalString,
  SENDGRID_API_KEY: optionalString,
  // Explicit transport override; auto-selected by key presence when unset.
  MAIL_PROVIDER: z.enum(['resend', 'sendgrid', 'console']).optional(),
  // From-address shared by every provider (RFC 5322 "Name <addr>" or bare addr).
  MAIL_FROM: optionalString.pipe(
    z.string().default('PlaySlot <no-reply@playslot.bg>'),
  ),
  // Every new booking is also copied to this address (the platform inbox,
  // info@playslot.bg). Unset = no copy is sent.
  PLATFORM_NOTIFY_EMAIL: optionalString.pipe(z.string().email().optional()),
  /**
   * Share the session cookie with the web app's host, e.g. ".playslot.bg" when
   * the API is api.playslot.bg and the site is playslot.bg. The site's server
   * can then read who is signed in and render the right menu in the first
   * HTML, instead of the signed-out one swapped a moment later. Unset: the
   * cookie stays on the API host only (local dev shares it anyway — cookies
   * ignore ports).
   */
  SESSION_COOKIE_DOMAIN: optionalString,

  // SendGrid dynamic templates (apps/api/src/mail/templates, uploaded with
  // `pnpm --filter @playslot/api mail:sync`). When an id is missing, that email
  // falls back to the inline HTML in MailService — nothing silently stops.
  SENDGRID_TEMPLATE_WELCOME: optionalString,
  SENDGRID_TEMPLATE_VERIFY_EMAIL: optionalString,
  SENDGRID_TEMPLATE_BOOKING_RECEIVED: optionalString,
  SENDGRID_TEMPLATE_BOOKING_CONFIRMED: optionalString,
  SENDGRID_TEMPLATE_BOOKING_CANCELLED: optionalString,
  SENDGRID_TEMPLATE_NOTICE: optionalString,
  // web push (VAPID). Absent => PushService logs instead of sending, the same
  // fallback the mail provider uses.
  VAPID_PUBLIC_KEY: optionalString,
  VAPID_PRIVATE_KEY: optionalString,
  VAPID_SUBJECT: optionalString,
  S3_ENDPOINT: optionalString,
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  GOOGLE_MAPS_API_KEY: optionalString,
  SENTRY_DSN: optionalString,
  POSTHOG_KEY: optionalString,
});

export const webEnvSchema = coreEnvSchema.extend({
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optionalString,
});

export type CoreEnv = z.infer<typeof coreEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;

/** Format a ZodError into a readable, multi-line boot error. */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

/**
 * Validate `source` (defaults to process.env) against a schema. Throws a
 * descriptive error listing every offending variable — never a raw ZodError.
 */
export function parseEnv<T extends z.ZodTypeAny>(
  schema: T,
  source: Record<string, unknown> = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${formatIssues(result.error)}\n` +
        `See .env.example for the expected variables.`,
    );
  }
  return result.data;
}

export function loadServerEnv(source: Record<string, unknown> = process.env): ServerEnv {
  return parseEnv(serverEnvSchema, source);
}

export function loadWebEnv(source: Record<string, unknown> = process.env): WebEnv {
  return parseEnv(webEnvSchema, source);
}
