import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { getClubs } from '@/lib/api';

export default async function ClubsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Clubs');
  const clubs = (await getClubs()) ?? [];

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '32px 20px 64px' }}>
        <h1 style={{ fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 800 }}>{t('title')}</h1>
        <p style={{ color: 'var(--ink-2)', margin: '8px 0 24px' }}>{t('subtitle')}</p>

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
                    borderRadius: 100,
                    padding: '6px 12px',
                    fontSize: 13,
                    fontWeight: 700,
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
