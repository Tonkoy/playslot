import { describe, expect, it } from 'vitest';
import { loadServerEnv, loadWebEnv, parseEnv, coreEnvSchema } from './env';

const baseCore = {
  NODE_ENV: 'test',
  APP_BASE_URL: 'http://localhost:3000',
  API_BASE_URL: 'http://localhost:3001',
};

describe('coreEnvSchema', () => {
  it('applies policy defaults when unset', () => {
    const env = parseEnv(coreEnvSchema, baseCore);
    expect(env.HOLD_TTL_MIN).toBe(10);
    expect(env.MAX_ADVANCE_DAYS).toBe(14);
    expect(env.DEFAULT_CURRENCY).toBe('EUR');
  });

  it('coerces numeric overrides from strings', () => {
    const env = parseEnv(coreEnvSchema, { ...baseCore, HOLD_TTL_MIN: '15' });
    expect(env.HOLD_TTL_MIN).toBe(15);
  });
});

describe('loadServerEnv', () => {
  it('accepts a valid server environment', () => {
    const env = loadServerEnv({
      ...baseCore,
      DATABASE_URL: 'postgresql://playslot:dev@localhost:5432/playslot',
      AUTH_SECRET: 'a-sufficiently-long-secret',
    });
    expect(env.DATABASE_URL).toContain('postgresql');
  });

  it('rejects a short AUTH_SECRET with a helpful message', () => {
    expect(() =>
      loadServerEnv({
        ...baseCore,
        DATABASE_URL: 'postgresql://x',
        AUTH_SECRET: 'short',
      }),
    ).toThrowError(/AUTH_SECRET/);
  });

  it('treats empty optional strings as undefined', () => {
    const env = loadServerEnv({
      ...baseCore,
      DATABASE_URL: 'postgresql://x',
      AUTH_SECRET: 'a-sufficiently-long-secret',
      STRIPE_SECRET_KEY: '',
    });
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
  });
});

describe('loadWebEnv', () => {
  it('requires a public API base url', () => {
    expect(() => loadWebEnv(baseCore)).toThrowError(/NEXT_PUBLIC_API_BASE_URL/);
  });

  it('accepts a valid web environment', () => {
    const env = loadWebEnv({ ...baseCore, NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001' });
    expect(env.NEXT_PUBLIC_API_BASE_URL).toBe('http://localhost:3001');
  });
});
