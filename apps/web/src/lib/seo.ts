import type { Metadata } from 'next';
import { routing, type AppLocale } from '@/i18n/routing';

/**
 * Central SEO configuration (spec: organic acquisition).
 *
 * Primary Bulgarian targets we want to rank for:
 *   • „резервирай корт онлайн“  → home, /clubs, /search
 *   • „резервирай треньор“      → /coaches, /sessions
 * Everything here exists to make those two intents unambiguous to crawlers:
 * one canonical URL per page, a bg⇄en hreflang pair, and titles/descriptions
 * that carry the phrase in natural sentences rather than keyword stuffing.
 */

/** Public origin, no trailing slash. Set NEXT_PUBLIC_SITE_URL in production. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
).replace(/\/$/, '');

export const SITE_NAME = 'PlaySlot';

/**
 * Whether THIS deployment may be indexed. Staging and preview deployments must
 * never be: a second copy of the same Bulgarian copy competing in the index
 * splits ranking signals and can outrank production on its own keywords.
 *
 * Production sets NEXT_PUBLIC_ALLOW_INDEXING=true explicitly — the default is
 * "no", so a new environment is closed until someone opts it in.
 */
export const ALLOW_INDEXING = process.env.NEXT_PUBLIC_ALLOW_INDEXING === 'true';

/** Locale → the `hreflang` value and the OG locale tag Google expects. */
const OG_LOCALE: Record<AppLocale, string> = { bg: 'bg_BG', en: 'en_US' };

/** Absolute URL for a locale-prefixed path (`/clubs` → `https://…/bg/clubs`). */
export function localeUrl(locale: AppLocale, path = ''): string {
  const clean = path === '/' ? '' : path.replace(/\/$/, '');
  const prefixed = clean.startsWith('/') ? clean : clean ? `/${clean}` : '';
  return `${SITE_URL}/${locale}${prefixed}`;
}

/**
 * Canonical + hreflang block for one page. Every localized page points at
 * itself as canonical and lists its siblings, so Google serves the Bulgarian
 * page to Bulgarian searchers instead of picking one and dropping the other.
 */
export function alternatesFor(locale: AppLocale, path = ''): Metadata['alternates'] {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = localeUrl(l, path);
  languages['x-default'] = localeUrl(routing.defaultLocale, path);
  return { canonical: localeUrl(locale, path), languages };
}

/** Open Graph + Twitter card defaults, merged into every page's metadata. */
export function socialFor(args: {
  locale: AppLocale;
  path?: string;
  title: string;
  description: string;
  image?: string;
  type?: 'website' | 'article' | 'profile';
}): Pick<Metadata, 'openGraph' | 'twitter'> {
  const url = localeUrl(args.locale, args.path ?? '');
  const images = [args.image ?? `${SITE_URL}/og-default.png`];
  return {
    openGraph: {
      type: args.type ?? 'website',
      siteName: SITE_NAME,
      locale: OG_LOCALE[args.locale],
      url,
      title: args.title,
      description: args.description,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: args.title,
      description: args.description,
      images,
    },
  };
}

/**
 * One call that produces a complete, crawler-ready metadata object for a
 * public page: title, description, canonical, hreflang and social cards.
 */
export function pageMetadata(args: {
  locale: AppLocale;
  path?: string;
  title: string;
  description: string;
  /** Skip the title template (used by the home page, which is the brand). */
  absoluteTitle?: boolean;
  image?: string;
  type?: 'website' | 'article' | 'profile';
}): Metadata {
  return {
    title: args.absoluteTitle ? { absolute: args.title } : args.title,
    description: args.description,
    alternates: alternatesFor(args.locale, args.path ?? ''),
    ...socialFor(args),
  };
}

/** Private/transactional pages must never compete with the landing pages. */
export const NOINDEX: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/** Serialize JSON-LD for a <script type="application/ld+json"> tag. */
export function jsonLd(data: Record<string, unknown> | Record<string, unknown>[]): string {
  // `<` is escaped so a club name or review can never close the script tag.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
