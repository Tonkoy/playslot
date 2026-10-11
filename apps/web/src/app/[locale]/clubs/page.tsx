/* eslint-disable @next/next/no-img-element -- club and coach photos are arbitrary
   remote URLs (each club's own host); next/image would need every one of those
   domains allow-listed, so a plain <img> is the honest choice here. */
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
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  {/* The club's own logo when it has one. `contain` keeps a
                      wordmark whole; a photo fits the square instead of being
                      cropped. Clubs without one keep the plain text card. */}
                  {club.photoUrl && (
                    <img
                      src={club.photoUrl}
                      alt=""
                      loading="lazy"
                      style={{
                        width: 56,
                        height: 56,
                        flexShrink: 0,
                        objectFit: 'contain',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius-sm)',
                        padding: 6,
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: 19 }}>
                      {club.name}
                    </div>
                    <div style={{ color: 'var(--ink-3)', fontSize: 14, marginTop: 4 }}>
                      {club.city.name} · {club.address}
                    </div>
                  </div>
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
