import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SPORTS } from '@playslot/contracts';
import { SiteHeader } from '@/components/SiteHeader';
import { SearchClient } from '@/components/SearchClient';
import { Link } from '@/i18n/navigation';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Home');
  const c = await getTranslations('Common');

  const titleParts = t('title').split(t('titleHighlight'));

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '0 20px' }}>
        <section style={{ padding: '48px 0 24px' }}>
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

          <h1 style={{ fontSize: 'clamp(30px, 6vw, 56px)', fontWeight: 800, margin: '14px 0 0' }}>
            {titleParts[0]}
            <mark style={{ background: 'var(--lime)', color: 'var(--on-lime)', padding: '0 0.12em', borderRadius: 8 }}>
              {t('titleHighlight')}
            </mark>
            {titleParts[1]}
          </h1>

          <p style={{ maxWidth: '58ch', color: 'var(--ink-2)', fontSize: 'clamp(16px, 2.2vw, 20px)', margin: '18px 0 0' }}>
            {t('subtitle')}
          </p>
        </section>

        {/* The search itself — find a free court to play. */}
        <section>
          <h2 style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 700, marginBottom: 14 }}>{t('searchCourt')}</h2>
          <SearchClient />
        </section>

        {/* With a coach. */}
        <section
          style={{
            borderTop: '1px solid var(--line)',
            marginTop: 28,
            padding: '20px 0',
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: 'var(--ink-2)', fontSize: 16 }}>{t('withCoachPrompt')}</span>
          <Link
            href="/coaches"
            style={{
              background: 'var(--surface)',
              color: 'var(--ink)',
              border: '1px solid var(--line-2)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 18px',
              fontWeight: 700,
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              textDecoration: 'none',
            }}
          >
            {t('searchLesson')} →
          </Link>
          <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 13, marginLeft: 'auto' }}>
            {t('supportedSports', { count: SPORTS.length })}
          </span>
        </section>

        <div style={{ paddingBottom: 48 }} />
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
