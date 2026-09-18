import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { localeUrl } from '@/lib/seo';
import { getClubs, getCoaches } from '@/lib/api';

/** Revalidate hourly: clubs and coaches are added steadily, not constantly. */
export const revalidate = 3600;

/** Public, indexable routes. Private areas (/admin, /me, auth) are excluded. */
const STATIC_ROUTES: { path: string; priority: number; changeFrequency: Change }[] = [
  { path: '', priority: 1, changeFrequency: 'daily' },
  { path: '/clubs', priority: 0.9, changeFrequency: 'daily' },
  { path: '/coaches', priority: 0.9, changeFrequency: 'daily' },
  { path: '/search', priority: 0.8, changeFrequency: 'daily' },
  { path: '/sessions', priority: 0.7, changeFrequency: 'daily' },
  { path: '/docs', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.4, changeFrequency: 'yearly' },
];

type Change = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

/** One entry per locale, each listing its siblings so hreflang is complete. */
function entry(path: string, priority: number, changeFrequency: Change): MetadataRoute.Sitemap {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = localeUrl(l, path);
  return routing.locales.map((locale) => ({
    url: localeUrl(locale, path),
    lastModified: new Date(),
    changeFrequency,
    priority,
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [clubs, coaches] = await Promise.all([
    getClubs().catch(() => null),
    getCoaches().catch(() => null),
  ]);

  return [
    ...STATIC_ROUTES.flatMap((r) => entry(r.path, r.priority, r.changeFrequency)),
    // Club and coach pages are the long tail: each one targets "резервирай
    // корт онлайн"/"резервирай треньор" plus its own name and city.
    ...(clubs ?? []).flatMap((c) => entry(`/clubs/${c.slug}`, 0.8, 'daily')),
    ...(coaches ?? []).flatMap((c) => entry(`/coaches/${c.coachProfileId}`, 0.7, 'weekly')),
  ];
}
