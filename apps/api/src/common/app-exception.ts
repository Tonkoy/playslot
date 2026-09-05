import type { ErrorCode } from '@playslot/contracts';

/**
 * Domain-level exception carrying a machine `code` from the error contract
 * (spec §14). The global filter turns it into the `{ error, message, details }`
 * body with the right HTTP status and a locale-appropriate message.
 */
export class AppException extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details?: Record<string, unknown>,
    /** Optional explicit message; otherwise the localized default is used. */
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AppException';
  }
}

// Convenience constructors for the common cases.
export const Errors = {
  validation: (details?: Record<string, unknown>) => new AppException('validation_failed', details),
  unauthenticated: () => new AppException('unauthenticated'),
  forbidden: (details?: Record<string, unknown>) => new AppException('forbidden', details),
  notFound: (details?: Record<string, unknown>) => new AppException('not_found', details),
  policyViolation: (details?: Record<string, unknown>) =>
    new AppException('policy_violation', details),
  rateLimited: () => new AppException('rate_limited'),
  internal: () => new AppException('internal'),
};
