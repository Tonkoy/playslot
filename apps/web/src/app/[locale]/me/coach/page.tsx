import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CoachHubClient } from '@/components/CoachHubClient';
import { SiteHeader } from '@/components/SiteHeader';

export default async function CoachHubPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('CoachHub');

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px 64px' }}>
        <h1 style={{ fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 800, marginBottom: 6 }}>{t('title')}</h1>
        <p style={{ color: 'var(--ink-2)', marginBottom: 20 }}>{t('subtitle')}</p>
        <CoachHubClient />
      </main>
    </>
  );
}
