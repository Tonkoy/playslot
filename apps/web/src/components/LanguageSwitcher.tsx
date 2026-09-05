'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

/**
 * In-app language switch (spec §20). Preserves the current path and only swaps
 * the locale segment via next-intl's locale-aware router.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('Nav');

  return (
    <label
      className="mono"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}
    >
      <span className="sr-only-visible" style={{ color: 'var(--ink-3)' }}>
        {t('language')}
      </span>
      <select
        aria-label={t('language')}
        value={locale}
        onChange={(e) => router.replace(pathname, { locale: e.target.value })}
        style={{
          background: 'var(--surface)',
          color: 'var(--ink)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-sm)',
          padding: '7px 10px',
          minHeight: 44,
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {l.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
