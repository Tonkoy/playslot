import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAppLocale } from '@/i18n/routing';
import { pageMetadata } from '@/lib/seo';
import { GroupSessionsList } from '@/components/GroupSessionsList';
import { SiteHeader } from '@/components/SiteHeader';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'Seo' });
  return pageMetadata({
    locale,
    path: '/sessions',
    title: t('sessions.title'),
    description: t('sessions.description'),
  });
}

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
