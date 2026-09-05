import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing (argon2id)', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('Password123!');
    expect(await verifyPassword(hash, 'Password123!')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Password123!');
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('produces distinct hashes for the same password (salted)', async () => {
    const a = await hashPassword('Password123!');
    const b = await hashPassword('Password123!');
    expect(a).not.toBe(b);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
});
