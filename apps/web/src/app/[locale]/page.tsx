import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SLOT_STATES, SPORTS, type SlotState } from '@playslot/contracts';
import { SiteHeader } from '@/components/SiteHeader';
import { Link } from '@/i18n/navigation';

// Map each slot state to a design token + a non-color cue (icon), per spec §7/§20.
const STATE_STYLE: Record<SlotState, { bg: string; fg: string; icon: string }> = {
  FREE: { bg: 'var(--free-soft)', fg: 'var(--free)', icon: '✓' },
  RESERVED: { bg: 'var(--booked-soft)', fg: 'var(--booked)', icon: '×' },
  MINE: { bg: 'var(--teal-soft)', fg: 'var(--teal)', icon: '★' },
  UNAVAILABLE: { bg: 'var(--booked-soft)', fg: 'var(--ink-3)', icon: '–' },
  PAST: { bg: 'var(--booked-soft)', fg: 'var(--ink-3)', icon: '·' },
  EVENT: { bg: 'var(--event-soft)', fg: 'var(--event)', icon: '◆' },
  TOURNAMENT: { bg: 'var(--event-soft)', fg: 'var(--event)', icon: '⚑' },
};

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Home');
  const st = await getTranslations('SlotStates');
  const c = await getTranslations('Common');

  const titleParts = t('title').split(t('titleHighlight'));

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '0 20px' }}>
        <section style={{ padding: '56px 0 40px' }}>
          <span
            className="mono"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--teal)',
            }}
          >
            {t('eyebrow')}
          </span>

          <h1 style={{ fontSize: 'clamp(34px, 7vw, 66px)', fontWeight: 800, margin: '14px 0 0' }}>
            {titleParts[0]}
            <mark
              style={{
                background: 'var(--lime)',
                color: 'var(--on-lime)',
                padding: '0 0.12em',
                borderRadius: 8,
              }}
            >
              {t('titleHighlight')}
            </mark>
            {titleParts[1]}
          </h1>

          <p
            style={{
              maxWidth: '58ch',
              color: 'var(--ink-2)',
              fontSize: 'clamp(16px, 2.2vw, 20px)',
              margin: '20px 0 0',
            }}
          >
            {t('subtitle')}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
            <Link
              href="/clubs"
              style={{
                background: 'var(--lime)',
                color: 'var(--on-lime)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 20px',
                fontWeight: 700,
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
                textDecoration: 'none',
              }}
            >
              {t('searchCourt')}
            </Link>
            <span
              style={{
                background: 'var(--surface)',
                color: 'var(--ink)',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 20px',
                fontWeight: 600,
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {t('searchLesson')}
            </span>
          </div>

          <p className="mono" style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 20 }}>
            {t('supportedSports', { count: SPORTS.length })}
          </p>
        </section>

        <section
          style={{
            borderTop: '1px solid var(--line)',
            padding: '32px 0',
          }}
        >
          <h2 style={{ fontSize: 'clamp(18px, 3vw, 24px)', fontWeight: 700, marginBottom: 16 }}>
            {t('legendTitle')}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 10,
            }}
          >
            {SLOT_STATES.map((state) => {
              const s = STATE_STYLE[state];
              return (
                <div
                  key={state}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: s.bg,
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 12px',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="mono"
                    style={{
                      width: 24,
                      height: 24,
                      display: 'inline-grid',
                      placeItems: 'center',
                      borderRadius: 6,
                      background: 'var(--surface)',
                      color: s.fg,
                      fontWeight: 700,
                    }}
                  >
                    {s.icon}
                  </span>
                  <span style={{ fontSize: 14, color: 'var(--ink)' }}>{st(state)}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section
          style={{
            borderTop: '1px solid var(--line)',
            padding: '28px 0 64px',
          }}
        >
          <div
            role="note"
            style={{
              background: 'var(--surface)',
              border: '1px dashed var(--line-2)',
              borderRadius: 'var(--radius)',
              padding: '18px 20px',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <strong style={{ display: 'block', marginBottom: 4 }}>{t('phaseNoticeTitle')}</strong>
            <span style={{ color: 'var(--ink-2)', fontSize: 15 }}>{t('phaseNotice')}</span>
          </div>
        </section>
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--line)',
          padding: '20px',
          textAlign: 'center',
          color: 'var(--ink-3)',
          fontSize: 13,
        }}
      >
        {c('appName')} · {c('tagline')}
      </footer>
    </>
  );
}
