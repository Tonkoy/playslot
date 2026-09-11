import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GroupSessionsList } from '@/components/GroupSessionsList';
import { SiteHeader } from '@/components/SiteHeader';

export default async function SessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('GroupSessions');

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '32px 20px 64px' }}>
        <h1 style={{ fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 800 }}>{t('pageTitle')}</h1>
        <p style={{ color: 'var(--ink-2)', margin: '8px 0 0' }}>{t('pageSubtitle')}</p>
        <GroupSessionsList heading="" />
      </main>
    </>
  );
}
