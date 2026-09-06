import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { ClubCalendar } from '@/components/admin/ClubCalendar';

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
      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 20px 64px' }}>
        <Link href={`/admin/clubs/${clubId}`} style={{ color: 'var(--teal)', fontSize: 14 }}>
          ← {a('back')}
        </Link>
        <h1 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, margin: '10px 0 16px' }}>
          {t('title')}
        </h1>
        <ClubCalendar clubId={Number(clubId)} />
      </main>
    </>
  );
}
