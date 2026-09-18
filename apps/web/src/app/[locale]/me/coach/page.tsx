import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

/** Account/admin screen: kept out of the index so it never competes in search. */
export const metadata: Metadata = NOINDEX;

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CoachHubClient } from '@/components/CoachHubClient';
import { PageHeader } from '@/components/PageHeader';
import { SiteHeader } from '@/components/SiteHeader';

export default async function CoachHubPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('CoachHub');

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px 64px' }}>
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />
        <CoachHubClient />
      </main>
    </>
  );
}
