import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SPORTS } from '@playslot/contracts';
import { SiteHeader } from '@/components/SiteHeader';
import { HeroSearchButton } from '@/components/HeroSearchButton';
import { SiteFooter } from '@/components/SiteFooter';
import { Link } from '@/i18n/navigation';
import { getFeaturedClub } from '@/lib/api';
import { JsonLd } from '@/components/JsonLd';
import { SITE_NAME, SITE_URL, localeUrl } from '@/lib/seo';
import { isAppLocale } from '@/i18n/routing';

/** HH:mm from an ISO string carrying the club's UTC offset. */
const hhmm = (iso: string) => iso.slice(11, 16);

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Organization + WebSite. The SearchAction makes PlaySlot eligible for a
  // sitelinks search box, and points crawlers at the court-search entry point.
  const home = isAppLocale(locale) ? localeUrl(locale, '') : SITE_URL;
  const graph = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: home,
      inLanguage: locale,
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${home}/search?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
  ];
  const t = await getTranslations('Home');
  const c = await getTranslations('Common');
  // Platform-admin-picked club headlining the homepage (spec: Platform console
  // "Feature on homepage"); falls back to the illustrative example below when
  // no club is featured, the API is unreachable, or it has no free slot soon.
  const featured = await getFeaturedClub().catch(() => null);
  const money = featured
    ? new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', {
        style: 'currency',
        currency: featured.slot.currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : null;

  const titleParts = t('title').split(t('titleHighlight'));

  const pillBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontWeight: 700,
    fontSize: 15,
    padding: '14px 24px',
    borderRadius: 'var(--pill)',
    whiteSpace: 'nowrap',
    border: '1.5px solid transparent',
    cursor: 'pointer',
    textDecoration: 'none',
  };

  const steps = [
    { title: t('stepCourtOnlyTitle'), body: t('stepCourtOnlyBody') },
    { title: t('stepCourtCoachTitle'), body: t('stepCourtCoachBody') },
    { title: t('stepCoachFirstTitle'), body: t('stepCoachFirstBody') },
  ];

  return (
    <>
      <JsonLd data={graph} />
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '0 20px' }}>
        {/* HERO */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 48,
            alignItems: 'center',
            padding: '56px 0 40px',
          }}
        >
          <div>
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
                color: 'var(--green)',
              }}
            >
              {t('eyebrow')}
            </span>

            <h1 style={{ fontSize: 'clamp(32px, 5.5vw, 56px)', fontWeight: 800, margin: '16px 0 0' }}>
              {titleParts[0]}
              <mark
                style={{
                  background: 'var(--lime)',
                  color: 'var(--on-lime)',
                  padding: '0 0.12em',
                  borderRadius: 9,
                  boxDecorationBreak: 'clone',
                  WebkitBoxDecorationBreak: 'clone',
                }}
              >
                {t('titleHighlight')}
              </mark>
              {titleParts[1]}
            </h1>

            <p style={{ maxWidth: '46ch', color: 'var(--ink-2)', fontSize: 'clamp(16px, 2.2vw, 18px)', margin: '20px 0 0' }}>
              {t('subtitle')}
            </p>

            <div style={{ display: 'flex', gap: 14, marginTop: 28, flexWrap: 'wrap' }}>
              <HeroSearchButton style={{ ...pillBtn, background: 'var(--green-deep)', color: '#fff' }}>
                {t('primaryCta')}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17L17 7" />
                  <path d="M9 7h8v8" />
                </svg>
              </HeroSearchButton>
              <a href="#how-it-works" style={{ ...pillBtn, background: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--line-2)' }}>
                {t('secondaryCta')}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3.5 2" />
                </svg>
              </a>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 30, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{t('popularSportsLabel')}</span>
              {SPORTS.map((s) => (
                <span
                  key={s}
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    padding: '7px 14px',
                    borderRadius: 'var(--pill)',
                    background: 'var(--green-soft)',
                    color: 'var(--green-deep)',
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Illustration: an example booking, not live data. */}
          <div style={{ position: 'relative' }}>
            <div
              style={{
                background: 'var(--green-deep)',
                borderRadius: 28,
                aspectRatio: '4 / 5',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: 'var(--shadow)',
              }}
            >
              <svg viewBox="0 0 400 500" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid slice">
                <rect width="400" height="500" fill="var(--green-deep)" />
                <rect x="40" y="40" width="320" height="420" fill="none" stroke="#2A7A54" strokeWidth="3" />
                <line x1="40" y1="250" x2="360" y2="250" stroke="#2A7A54" strokeWidth="3" />
                <rect x="40" y="130" width="320" height="240" fill="none" stroke="#2A7A54" strokeWidth="3" />
                <line x1="200" y1="130" x2="200" y2="370" stroke="#2A7A54" strokeWidth="3" />
                <line x1="40" y1="250" x2="360" y2="250" stroke="#3E9068" strokeWidth="6" strokeDasharray="2 10" strokeLinecap="round" />
                <circle cx="200" cy="250" r="120" fill="none" stroke="#1E6B47" strokeWidth="1" opacity="0.5" />
              </svg>
            </div>
            {featured ? (
              <Link
                // Deep-links straight into the club's schedule, pre-set to the
                // date this free slot was found on (spec: "click it, go
                // directly to the schedule ... in the selected date").
                href={`/clubs/${featured.club.slug}?date=${featured.slot.date}`}
                style={{
                  position: 'absolute',
                  left: -16,
                  bottom: 28,
                  padding: '16px 18px',
                  width: 216,
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius)',
                  boxShadow: 'var(--shadow-sm)',
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'block',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>
                    {featured.slot.courtName || featured.club.name}
                  </span>
                  {featured.slot.hasCoach && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: 'var(--pill)',
                        background: 'var(--green-soft)',
                        color: 'var(--green-deep)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ◍ {t('heroCardCoachTag')}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
                  {featured.club.name} · {featured.club.address}
                </div>
                <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, fontSize: 13, color: 'var(--ink-2)' }}>
                  <span>
                    {hhmm(featured.slot.start)}–{hhmm(featured.slot.end)}
                  </span>
                  {featured.slot.priceCents != null && (
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
                      {money!.format(featured.slot.priceCents / 100)}
                    </span>
                  )}
                </div>
              </Link>
            ) : (
              <div
                className="card"
                style={{
                  position: 'absolute',
                  left: -16,
                  bottom: 28,
                  padding: '16px 18px',
                  width: 200,
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{t('heroCardClub')}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 'var(--pill)',
                      background: 'var(--green-soft)',
                      color: 'var(--green-deep)',
                    }}
                  >
                    ◍ {t('heroCardCoachTag')}
                  </span>
                </div>
                <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, fontSize: 13, color: 'var(--ink-2)' }}>
                  <span>18:00–19:00</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>16.00 €</span>
                </div>
              </div>
            )}
            <div
              style={{
                position: 'absolute',
                right: -12,
                top: 24,
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{t('heroCardStatus')}</span>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" style={{ borderTop: '1px solid var(--line)', padding: '48px 0' }}>
          <span
            className="mono"
            style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green)' }}
          >
            {t('howItWorksEyebrow')}
          </span>
          <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 800, margin: '10px 0 26px', maxWidth: '20ch' }}>
            {t('howItWorksTitle')}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
            {steps.map((step) => (
              <div
                key={step.title}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius)',
                  boxShadow: 'var(--shadow-sm)',
                  padding: 24,
                }}
              >
                <h3 style={{ fontSize: 17, fontWeight: 700 }}>{step.title}</h3>
                <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 8 }}>{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <div style={{ paddingBottom: 24 }} />
      </main>

      <SiteFooter />
    </>
  );
}
