import { describe, expect, it } from 'vitest';
import { expiryFromNow, hashToken, issueToken } from './tokens';

describe('verification tokens', () => {
  it('hashes deterministically', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('issues a raw token whose stored hash matches on re-hash', () => {
    const { raw, hash } = issueToken();
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    expect(hashToken(raw)).toBe(hash);
  });

  it('never emits the raw token as the stored value', () => {
    const { raw, hash } = issueToken();
    expect(hash).not.toBe(raw);
    expect(hash).toHaveLength(64); // sha256 hex
  });

  it('produces unique tokens', () => {
    const set = new Set(Array.from({ length: 50 }, () => issueToken().raw));
    expect(set.size).toBe(50);
  });

  it('computes a future expiry', () => {
    const before = Date.now();
    const exp = expiryFromNow(60).getTime();
    expect(exp).toBeGreaterThanOrEqual(before + 59 * 60_000);
    expect(exp).toBeLessThanOrEqual(before + 61 * 60_000);
  });
});
