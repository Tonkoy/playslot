import { describe, expect, it } from 'vitest';
import { normalizeLocale, t } from './i18n';

describe('normalizeLocale', () => {
  it('defaults to Bulgarian', () => {
    expect(normalizeLocale(undefined)).toBe('bg');
    expect(normalizeLocale('')).toBe('bg');
    expect(normalizeLocale('fr-FR')).toBe('bg');
  });

  it('detects supported locales from Accept-Language style headers', () => {
    expect(normalizeLocale('en-US,en;q=0.9')).toBe('en');
    expect(normalizeLocale('BG')).toBe('bg');
  });
});

describe('t (error contract messages)', () => {
  it('returns the Bulgarian message by default', () => {
    expect(t('forbidden')).toBe(t('forbidden', 'bg'));
    expect(t('forbidden', 'bg')).not.toBe(t('forbidden', 'en'));
  });

  it('covers every error code in both locales', () => {
    for (const code of ['validation_failed', 'unauthenticated', 'not_found', 'internal'] as const) {
      expect(t(code, 'bg').length).toBeGreaterThan(0);
      expect(t(code, 'en').length).toBeGreaterThan(0);
    }
  });
});
