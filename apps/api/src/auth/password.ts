import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing with argon2id (spec §20 security). Defaults from @node-rs are
 * OWASP-reasonable; kept centralized so cost params can be tuned in one place.
 */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}
