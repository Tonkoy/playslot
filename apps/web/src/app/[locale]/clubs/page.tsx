import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAppLocale } from '@/i18n/routing';
import { pageMetadata } from '@/lib/seo';
import { SiteHeader } from '@/components/SiteHeader';
import { PageHeader } from '@/components/PageHeader';
import { ClubsExplorer } from '@/components/clubs/ClubsExplorer';
import { getClubs } from '@/lib/api';

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
    path: '/clubs',
    title: t('clubs.title'),
    description: t('clubs.description'),
  });
}

export default async function ClubsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Clubs');
  const clubs = (await getClubs()) ?? [];

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '32px 20px 64px' }}>
        <PageHeader title={t('title')} subtitle={t('subtitle')} />

        {clubs.length === 0 ? (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px dashed var(--line-2)',
              borderRadius: 'var(--radius)',
              padding: 24,
              color: 'var(--ink-2)',
            }}
          >
            {t('empty')}
          </div>
        ) : (
          <ClubsExplorer clubs={clubs} />
        )}
      </main>
    </>
  );
}
