import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { SearchClient } from '@/components/SearchClient';

export default async function SearchPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Search');
  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '32px 20px 64px' }}>
        <h1 style={{ fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 800 }}>{t('title')}</h1>
        <p style={{ color: 'var(--ink-2)', margin: '8px 0 24px' }}>{t('subtitle')}</p>
        <SearchClient />
      </main>
    </>
  );
}
