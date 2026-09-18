import type { MetadataRoute } from 'next';
import { ALLOW_INDEXING, SITE_URL } from '@/lib/seo';

/**
 * Crawl policy. Everything public is open; account, admin and auth areas are
 * closed off so crawl budget goes to the pages we actually want ranking, and
 * so signed-in-only screens never surface in results.
 */
export default function robots(): MetadataRoute.Robots {
  // Staging/preview: refuse the whole site rather than leak a duplicate of
  // production into the index.
  if (!ALLOW_INDEXING) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/*/admin',
          '/*/me',
          '/*/login',
          '/*/register',
          '/*/forgot-password',
          '/*/auth/',
          '/api/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
