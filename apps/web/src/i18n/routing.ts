import { defineRouting } from 'next-intl/routing';

/**
 * Locale routing (spec §20): Bulgarian is the default, English is available, and
 * the locale is always present in the URL (`/[locale]/…`). Russian is deferrable.
 */
export const routing = defineRouting({
  locales: ['bg', 'en'],
  defaultLocale: 'bg',
  localePrefix: 'always',
});

export type AppLocale = (typeof routing.locales)[number];

/** Type guard for a supported locale (next-intl v3 has no `hasLocale` export). */
export function isAppLocale(value: string | undefined): value is AppLocale {
  return value !== undefined && (routing.locales as readonly string[]).includes(value);
}
