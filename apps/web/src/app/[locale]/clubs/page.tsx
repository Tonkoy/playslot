import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAppLocale } from '@/i18n/routing';
import { pageMetadata } from '@/lib/seo';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { PageHeader } from '@/components/PageHeader';
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
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />

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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 16,
            }}
          >
            {clubs.map((club) => (
              <Link
                key={club.id}
                href={`/clubs/${club.slug}`}
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  color: 'var(--ink)',
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius)',
                  padding: 18,
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: 19 }}>
                  {club.name}
                </div>
                <div style={{ color: 'var(--ink-3)', fontSize: 14, marginTop: 4 }}>
                  {club.city.name} · {club.address}
                </div>
                <span
                  style={{
                    display: 'inline-block',
                    marginTop: 14,
                    color: 'var(--on-lime)',
                    background: 'var(--lime)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  {t('viewClub')} →
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
