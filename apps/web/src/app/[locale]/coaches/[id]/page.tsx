import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Avatar } from '@/components/Avatar';
import { SiteHeader } from '@/components/SiteHeader';
import { getCoach } from '@/lib/api';

export default async function CoachProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Coaches');
  const coach = await getCoach(Number(id));

  if (!coach) {
    return (
      <>
        <SiteHeader />
        <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 20px' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>{t('notFound')}</h1>
          <Link href="/coaches" style={{ color: 'var(--teal)', marginTop: 16, display: 'inline-block' }}>
            ← {t('backToCoaches')}
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px 64px' }}>
        <Link href="/coaches" style={{ color: 'var(--teal)', fontSize: 14 }}>
          ← {t('backToCoaches')}
        </Link>
        {/* ── info box ── */}
        <section
          style={{
            display: 'flex',
            gap: 18,
            alignItems: 'center',
            flexWrap: 'wrap',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            padding: 20,
            margin: '12px 0 8px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <Avatar name={coach.name} photoUrl={coach.photoUrl} size={88} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 800 }}>{coach.name}</h1>
            <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4 }}>
              {coach.clubs.map((c) => c.name).join(' · ')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {coach.languages.map((l) => (
                <span key={l} className="mono" style={chip}>
                  {l.toUpperCase()}
                </span>
              ))}
              {coach.levels.map((l) => (
                <span key={l} className="mono" style={{ ...chip, borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                  {l}
                </span>
              ))}
            </div>
          </div>
        </section>
        {coach.bio && <p style={{ color: 'var(--ink-2)', maxWidth: '65ch', marginTop: 12 }}>{coach.bio}</p>}

        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '20px 0 10px' }}>{t('services')}</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {coach.services.map((s) => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
              <span>
                <strong>{s.name}</strong>
                <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 12, marginLeft: 8 }}>
                  {s.durationMin} {t('min')} · {s.minPlayers}-{s.maxPlayers} {t('players')}
                </span>
              </span>
              <strong>{Math.round(s.priceCents / 100)} €</strong>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '24px 0 10px' }}>{t('clubs')}</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {coach.clubs.map((c) => (
            <Link key={c.id} href={`/clubs/${c.slug}`} style={{ ...chip, textDecoration: 'none', color: 'var(--ink)' }}>
              {c.name} →
            </Link>
          ))}
        </div>
        <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 20 }}>{t('bookHint')}</p>
      </main>
    </>
  );
}

const chip: React.CSSProperties = {
  fontSize: 12.5,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 100,
  padding: '6px 12px',
  color: 'var(--ink-2)',
};
