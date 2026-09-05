import { createHash, randomBytes } from 'node:crypto';

/**
 * Single-use verification / reset tokens (spec §12). The raw token is emailed;
 * only its SHA-256 hash is stored, so a DB leak can't be used to verify or
 * reset. Lookups hash the incoming token and match on the stored hash.
 */
export interface IssuedToken {
  raw: string;
  hash: string;
}

export function issueToken(bytes = 32): IssuedToken {
  const raw = randomBytes(bytes).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function expiryFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

export const EMAIL_VERIFY_TTL_MIN = 24 * 60; // 24h (spec §12)
export const PASSWORD_RESET_TTL_MIN = 60; // 1h, single-use (spec §12)
