import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { getCoaches } from '@/lib/api';

export default async function CoachesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Coaches');
  const coaches = (await getCoaches()) ?? [];

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '32px 20px 64px' }}>
        <h1 style={{ fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 800 }}>{t('title')}</h1>
        <p style={{ color: 'var(--ink-2)', margin: '8px 0 24px' }}>{t('subtitle')}</p>

        {coaches.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px dashed var(--line-2)', borderRadius: 'var(--radius)', padding: 24, color: 'var(--ink-2)' }}>
            {t('empty')}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {coaches.map((coach) => (
              <Link
                key={coach.coachProfileId}
                href={`/coaches/${coach.coachProfileId}`}
                style={{ display: 'block', textDecoration: 'none', color: 'var(--ink)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 18, boxShadow: 'var(--shadow-sm)' }}
              >
                <div style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: 19 }}>{coach.name}</div>
                {coach.bio && <div style={{ color: 'var(--ink-3)', fontSize: 14, marginTop: 4 }}>{coach.bio}</div>}
                <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 10 }}>
                  {coach.clubs.map((c) => c.name).join(' · ')}
                </div>
                {coach.services[0] && (
                  <div style={{ marginTop: 10, fontWeight: 700 }}>
                    {t('from')} {Math.round(coach.services[0].priceCents / 100)} €
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
