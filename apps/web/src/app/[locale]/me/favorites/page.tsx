import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

/** Account/admin screen: kept out of the index so it never competes in search. */
export const metadata: Metadata = NOINDEX;

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { FavoritesList } from '@/components/FavoritesList';
import { PageHeader } from '@/components/PageHeader';

export default async function FavoritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Favorites');
  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '32px 20px 64px' }}>
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />
        <FavoritesList />
      </main>
    </>
  );
}
