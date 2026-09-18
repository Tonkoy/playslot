import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

/** Account/admin screen: kept out of the index so it never competes in search. */
export const metadata: Metadata = NOINDEX;

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { ClubCalendar } from '@/components/admin/ClubCalendar';
import { PageHeader } from '@/components/PageHeader';

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ locale: string; clubId: string }>;
}) {
  const { locale, clubId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Calendar');
  const a = await getTranslations('Admin');

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '24px 20px 64px' }}>
        <Link href={`/admin/clubs/${clubId}`} style={{ color: 'var(--teal)', fontSize: 14 }}>
          ← {a('back')}
        </Link>
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
        <ClubCalendar clubId={Number(clubId)} />
      </main>
    </>
  );
}
