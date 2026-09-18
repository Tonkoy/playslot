import { jsonLd } from '@/lib/seo';

/**
 * Renders a JSON-LD block. Structured data is how the two target intents get
 * rich results: a club becomes a bookable SportsActivityLocation, a coach a
 * Person offering lessons, and the FAQ page becomes an expandable SERP entry.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // Content is ours (and escaped by `jsonLd`), never user-controlled HTML.
      dangerouslySetInnerHTML={{ __html: jsonLd(data) }}
    />
  );
}
