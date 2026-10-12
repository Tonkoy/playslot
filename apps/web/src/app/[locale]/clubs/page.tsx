import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAppLocale } from '@/i18n/routing';
import { pageMetadata } from '@/lib/seo';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { PageHeader } from '@/components/PageHeader';
import { CourtMark } from '@/components/ClubThumb';
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
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  textDecoration: 'none',
                  color: 'var(--ink)',
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {/* Product-card layout: picture on top, then the name, then the
                    CTA. `contain` keeps a wordmark whole instead of cropping
                    it; clubs without a picture get the court mark so the grid
                    stays even. */}
                <div
                  style={{
                    // A fixed height (not an aspect ratio) keeps every card's
                    // picture band identical — a portrait photo would other-
                    // wise stretch its card taller than the rest of the row.
                    height: 180,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    background: 'var(--surface-2)',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  {club.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote club hosts; see ClubThumb
                    <img
                      src={club.photoUrl}
                      alt=""
                      loading="lazy"
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        width: 'auto',
                        height: 'auto',
                        objectFit: 'contain',
                        padding: 14,
                        boxSizing: 'border-box',
                      }}
                    />
                  ) : (
                    <CourtMark />
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 18 }}>
                  <div style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: 19 }}>
                    {club.name}
                  </div>
                  <div style={{ color: 'var(--ink-3)', fontSize: 14, marginTop: 4 }}>
                    {club.city.name} · {club.address}
                  </div>
                  <span
                    style={{
                      display: 'block',
                      textAlign: 'center',
                      marginTop: 'auto',
                      paddingTop: 14,
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        color: 'var(--on-lime)',
                        background: 'var(--lime)',
                        borderRadius: 'var(--pill)',
                        padding: '11px 14px',
                        fontSize: 13.5,
                        fontWeight: 800,
                      }}
                    >
                      {t('viewClub')} →
                    </span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
