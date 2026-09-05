import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { AvailabilityGrid } from '@/components/availability/AvailabilityGrid';
import { getClub, getClubCourts } from '@/lib/api';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClub(slug);
  return {
    title: club ? `${club.name} — PlaySlot` : 'PlaySlot',
    description: club?.description ?? undefined,
  };
}

export default async function ClubProfilePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('ClubProfile');
  const club = await getClub(slug);

  if (!club) {
    return (
      <>
        <SiteHeader />
        <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '48px 20px' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>{t('notFoundTitle')}</h1>
          <p style={{ color: 'var(--ink-2)', marginTop: 8 }}>{t('notFound')}</p>
          <Link href="/clubs" style={{ color: 'var(--teal)', marginTop: 16, display: 'inline-block' }}>
            ← {t('backToClubs')}
          </Link>
        </main>
      </>
    );
  }

  const courts = (await getClubCourts(slug)) ?? [];

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '24px 20px 64px' }}>
        <Link href="/clubs" style={{ color: 'var(--teal)', fontSize: 14 }}>
          ← {t('backToClubs')}
        </Link>

        <header style={{ margin: '12px 0 20px' }}>
          <h1 style={{ fontSize: 'clamp(26px, 5vw, 42px)', fontWeight: 800 }}>{club.name}</h1>
          <p style={{ color: 'var(--ink-2)', marginTop: 6 }}>
            {club.city.name} · {club.address}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <span className="mono" style={chip}>
              {t('courts')}: {courts.length}
            </span>
            {club.acceptsMultisport && (
              <span className="mono" style={{ ...chip, borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                {t('acceptsMultisport')}
              </span>
            )}
          </div>
          {club.description && (
            <p style={{ color: 'var(--ink-2)', marginTop: 14, maxWidth: '70ch' }}>{club.description}</p>
          )}
        </header>

        <h2 style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 700, margin: '8px 0' }}>
          {t('availability')}
        </h2>
        <AvailabilityGrid clubId={club.id} />
      </main>
    </>
  );
}

const chip: React.CSSProperties = {
  fontSize: 12.5,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 100,
  padding: '5px 12px',
  color: 'var(--ink-2)',
};
