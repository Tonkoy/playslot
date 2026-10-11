import type { ApiError, ErrorCode } from '@playslot/contracts';

/**
 * An API error with its machine-readable parts kept: `details.reason` is what
 * lets the UI say *why* something was refused instead of the generic
 * "Действието нарушава политиката." (QA-09).
 */
export class ApiRequestError extends Error {
  readonly code: ErrorCode | 'unknown';
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(status: number, body: Partial<ApiError> | null, fallback: string) {
    super(body?.message ?? fallback);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = (body?.error as ErrorCode | undefined) ?? 'unknown';
    this.details = (body?.details as Record<string, unknown>) ?? {};
  }

  /** The server's reason code, when it sent one. */
  get reason(): string | null {
    const r = this.details.reason;
    return typeof r === 'string' ? r : null;
  }
}

/**
 * Per-field validation codes from a `validation_failed` response, as
 * `{ password: ['password_upper', 'password_digit'] }`. The form shows them
 * under the field they belong to, in the user's language (`FieldErrors`).
 */
export function fieldErrorsOf(err: unknown): Record<string, string[]> {
  if (!(err instanceof ApiRequestError) || err.code !== 'validation_failed') return {};
  const fields = err.details.fields;
  if (!fields || typeof fields !== 'object') return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (Array.isArray(value)) out[key] = value.map(String);
    else if (typeof value === 'string') out[key] = [value];
  }
  return out;
}

/** Reasons the web app has its own wording for. Keep in sync with bg/en `Errors`. */
export const KNOWN_REASONS = [
  'beyond_max_advance',
  'in_past',
  'invalid_start',
  'misaligned_slot',
  'crosses_midnight',
  'below_min_duration',
  'full',
  'overlap',
  'closed',
  'club_closed',
  'closure_overlaps_bookings',
  'coach_closed',
  'coach_not_at_club',
  'email_not_verified',
  'account_suspended',
  'no_price',
  'no_courts',
  'no_past_booking',
  'not_attended',
  'not_finished',
  'ended',
] as const;
export type KnownReason = (typeof KNOWN_REASONS)[number];

export function isKnownReason(value: unknown): value is KnownReason {
  return typeof value === 'string' && (KNOWN_REASONS as readonly string[]).includes(value);
}

/**
 * The message to show for a failed request: the specific reason when we know
 * it, otherwise whatever the server said, otherwise a generic fallback.
 * `t` is the `Errors` namespace; `tt` the generic `Toasts` one.
 */
export function errorMessage(
  err: unknown,
  t: (key: string, values?: Record<string, string | number>) => string,
  fallback: string,
): string {
  if (err instanceof ApiRequestError) {
    const reason = err.reason;
    if (isKnownReason(reason)) return t(reason);
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
