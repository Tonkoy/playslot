/**
 * The single error contract shared by API and web (spec §14). Every API error
 * body is `{ error, message, details? }` with the matching HTTP status. `error`
 * is a stable machine code; `message` is a localized human string.
 */

export const ERROR_CODES = {
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  availability_changed: 409,
  price_mismatch: 409,
  hold_expired: 410,
  payment_required: 402,
  rate_limited: 429,
  policy_violation: 422,
  internal: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface ApiError {
  error: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export function httpStatusFor(code: ErrorCode): number {
  return ERROR_CODES[code];
}

export function apiError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return details ? { error: code, message, details } : { error: code, message };
}
