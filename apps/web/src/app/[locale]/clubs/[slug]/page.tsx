import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAppLocale } from '@/i18n/routing';
import { NOINDEX, SITE_NAME, localeUrl, pageMetadata } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { AvailabilityGrid } from '@/components/availability/AvailabilityGrid';
import { SlotLegend } from '@/components/SlotLegend';
import { EventsSection } from '@/components/EventsSection';
import { FavoriteButton } from '@/components/FavoriteButton';
import { MembershipPlansSection } from '@/components/MembershipPlansSection';
import { ReviewsSection } from '@/components/ReviewsSection';
import { Avatar } from '@/components/Avatar';
import { getClub, getClubCourts, getCoaches } from '@/lib/api';
import { minToHHMM } from '@/lib/tz';

const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday … Sunday

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isAppLocale(locale)) return {};
  const club = await getClub(slug);
  const t = await getTranslations({ locale, namespace: 'Seo' });
  if (!club) return { ...NOINDEX, title: t('clubs.title') };

  return pageMetadata({
    locale,
    path: `/clubs/${club.slug}`,
    title: t('club.title', { name: club.name }),
    // The club's own blurb wins when it has one — it's unique copy, which
    // reads better in the SERP than a template. Otherwise fall back to the
    // keyword-bearing template so the page still states its intent.
    description:
      club.description?.trim() ||
      t('club.description', { name: club.name, city: club.city.name }),
    image: club.photoUrl ?? undefined,
  });
}

export default async function ClubProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { locale, slug } = await params;
  const { date } = await searchParams;
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
  const coaches = (await getCoaches(club.id)) ?? [];

  // A club page is a local-business result: name, address, geo and opening
  // hours let Google show it for "резервирай корт онлайн" + city queries, and
  // the breadcrumb renders the Начало › Клубове › <club> trail in the SERP.
  const clubUrl = isAppLocale(locale) ? localeUrl(locale, `/clubs/${club.slug}`) : '';
  const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const pad = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const clubGraph = [
    {
      '@context': 'https://schema.org',
      '@type': 'SportsActivityLocation',
      name: club.name,
      url: clubUrl,
      ...(club.description ? { description: club.description } : {}),
      ...(club.photoUrl ? { image: club.photoUrl } : {}),
      ...(club.phone ? { telephone: club.phone } : {}),
      address: {
        '@type': 'PostalAddress',
        streetAddress: club.address,
        addressLocality: club.city.name,
        addressCountry: 'BG',
      },
      ...(club.lat != null && club.lng != null
        ? { geo: { '@type': 'GeoCoordinates', latitude: club.lat, longitude: club.lng } }
        : {}),
      ...(club.openingHours?.length
        ? {
            openingHoursSpecification: club.openingHours.map((h) => ({
              '@type': 'OpeningHoursSpecification',
              dayOfWeek: DAY[h.weekday],
              opens: pad(h.startMin),
              closes: pad(h.endMin),
            })),
          }
        : {}),
      ...(courts.length
        ? { amenityFeature: courts.map((c) => ({ '@type': 'LocationFeatureSpecification', name: c.name, value: true })) }
        : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: isAppLocale(locale) ? localeUrl(locale, '') : '' },
        { '@type': 'ListItem', position: 2, name: t('backToClubs'), item: isAppLocale(locale) ? localeUrl(locale, '/clubs') : '' },
        { '@type': 'ListItem', position: 3, name: club.name, item: clubUrl },
      ],
    },
  ];
  const weekday = (w: number) =>
    new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { weekday: 'long' }).format(new Date(Date.UTC(2024, 0, 7 + w)));

  return (
    <>
      <JsonLd data={clubGraph} />
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '24px 20px 64px' }}>
        <Link href="/clubs" style={{ color: 'var(--teal)', fontSize: 14 }}>
          ← {t('backToClubs')}
        </Link>

        <header style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap', margin: '12px 0 20px' }}>
          {club.photoUrl ? (
            <img src={club.photoUrl} alt={club.name} style={{ width: 96, height: 96, borderRadius: 'var(--radius)', objectFit: 'cover', border: '1px solid var(--line)', flexShrink: 0 }} />
          ) : (
            <span style={{ width: 96, height: 96, borderRadius: 'var(--radius)', border: '1px solid var(--line-2)', background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontWeight: 800, fontSize: 34, flexShrink: 0 }}>
              {club.name.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 'clamp(26px, 5vw, 42px)', fontWeight: 800 }}>{club.name}</h1>
              <span style={{ marginLeft: 'auto' }}>
                <FavoriteButton clubId={club.id} />
              </span>
            </div>
            <p style={{ color: 'var(--ink-2)', marginTop: 6 }}>
              {club.city.name} · {club.address}
              {club.phone ? <> · <a href={`tel:${club.phone}`} style={{ color: 'var(--teal)' }}>{club.phone}</a></> : null}
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
          </div>
        </header>

        {/* opening hours + rules */}
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginBottom: 8 }}>
          {(club.openingHours?.length ?? 0) > 0 && (
            <section style={infoCard}>
              <h2 style={infoH2}>{t('openingHours')}</h2>
              <div style={{ display: 'grid', gap: 4 }}>
                {WEEK.map((w) => {
                  const h = club.openingHours!.find((x) => x.weekday === w);
                  return (
                    <div key={w} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ textTransform: 'capitalize', color: 'var(--ink-2)' }}>{weekday(w)}</span>
                      <span className="mono" style={{ color: h ? 'var(--ink)' : 'var(--ink-3)', fontSize: 13 }}>
                        {h ? `${minToHHMM(h.startMin)}–${minToHHMM(h.endMin)}` : t('closed')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {club.rules && (
            <section style={infoCard}>
              <h2 style={infoH2}>{t('rules')}</h2>
              <p style={{ color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{club.rules}</p>
            </section>
          )}
        </div>

        <h2 style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 700, margin: '16px 0 8px' }}>
          {t('availability')}
        </h2>
        <SlotLegend />
        <AvailabilityGrid clubId={club.id} initialDate={date} />

        {coaches.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>{t('coaches')}</h2>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {coaches.map((c) => (
                <Link key={c.coachProfileId} href={`/coaches/${c.coachProfileId}`} style={{ display: 'flex', gap: 12, alignItems: 'center', textDecoration: 'none', color: 'var(--ink)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 14, boxShadow: 'var(--shadow-sm)' }}>
                  <Avatar name={c.name} photoUrl={c.photoUrl} size={48} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                    {c.hourlyRateCents != null && (
                      <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 12 }}>{Math.round(c.hourlyRateCents / 100)} €/{t('hour')}</div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <EventsSection clubId={club.id} currency={club.currency} timezone={club.timezone} />
        <MembershipPlansSection clubId={club.id} currency={club.currency} />
        <ReviewsSection clubId={club.id} />
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
const infoCard: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 18,
  boxShadow: 'var(--shadow-sm)',
};
const infoH2: React.CSSProperties = { fontSize: 16, fontWeight: 700, marginBottom: 10 };
