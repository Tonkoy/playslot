/* eslint-disable @next/next/no-img-element -- covers are remote URLs on Smile
   Cup's image host, already resized there; see lib/smilecup.ts. */
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { Link } from '@/i18n/navigation';
import { isAppLocale } from '@/i18n/routing';
import { pageMetadata } from '@/lib/seo';
import {
  SMILECUP_PRICE_CURRENCY,
  SMILECUP_SITE,
  TOURNAMENT_GENDERS,
  getUpcomingTournaments,
  type Tournament,
  type TournamentGender,
} from '@/lib/smilecup';

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
    path: '/tournaments',
    title: t('tournaments.title'),
    description: t('tournaments.description'),
  });
}

export default async function TournamentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ gender?: string }>;
}) {
  const { locale } = await params;
  const { gender: genderParam } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('Tournaments');

  const gender = TOURNAMENT_GENDERS.find((g) => g === genderParam) ?? null;
  const all = await getUpcomingTournaments();
  const shown = all && gender ? all.filter((x) => x.gender === gender) : all;

  const loc = locale === 'bg' ? 'bg-BG' : 'en-GB';
  // `day` is already the calendar day in Sofia; formatting it as UTC keeps it
  // that day wherever the server happens to run.
  const dayFormat = new Intl.DateTimeFormat(loc, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const money = new Intl.NumberFormat(loc, {
    style: 'currency',
    currency: SMILECUP_PRICE_CURRENCY,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });

  const filters: { key: TournamentGender | null; label: string }[] = [
    { key: null, label: t('filterAll') },
    { key: 'f', label: t('gender.f') },
    { key: 'm', label: t('gender.m') },
    { key: 'uni', label: t('gender.uni') },
  ];

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '32px 20px 64px' }}>
        <h1 style={{ fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 800 }}>{t('title')}</h1>
        <p style={{ color: 'var(--ink-2)', margin: '8px 0 20px', maxWidth: 640 }}>
          {t.rich('subtitle', {
            site: (chunks) => (
              <a href={SMILECUP_SITE} target="_blank" rel="noopener" style={{ color: 'var(--teal)', fontWeight: 600 }}>
                {chunks}
              </a>
            ),
          })}
        </p>

        {all && all.length > 0 && (
          <nav aria-label={t('filterLabel')} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {filters.map((f) => {
              const active = f.key === gender;
              return (
                <Link
                  key={f.key ?? 'all'}
                  href={f.key ? `/tournaments?gender=${f.key}` : '/tournaments'}
                  aria-current={active ? 'true' : undefined}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 'var(--pill)',
                    fontSize: 14,
                    fontWeight: 700,
                    textDecoration: 'none',
                    border: '1px solid',
                    borderColor: active ? 'var(--green-deep)' : 'var(--line-2)',
                    background: active ? 'var(--green-deep)' : 'var(--surface)',
                    color: active ? '#fff' : 'var(--ink-2)',
                  }}
                >
                  {f.label}
                </Link>
              );
            })}
          </nav>
        )}

        {shown === null ? (
          <div role="alert" style={noticeBox}>
            {t('unavailable')}{' '}
            <a href={`${SMILECUP_SITE}/tournaments/`} target="_blank" rel="noopener" style={{ color: 'var(--teal)', fontWeight: 600 }}>
              {t('openSite')}
            </a>
          </div>
        ) : shown.length === 0 ? (
          <div style={noticeBox}>{gender ? t('emptyFiltered') : t('empty')}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
            {shown.map((x) => (
              <TournamentCard
                key={x.id}
                tournament={x}
                date={dayFormat.format(new Date(`${x.day}T00:00:00Z`))}
                price={x.price === null ? null : money.format(x.price)}
                t={t}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<'Tournaments'>>>;

function TournamentCard({
  tournament: x,
  date,
  price,
  t,
}: {
  tournament: Tournament;
  date: string;
  price: string | null;
  t: T;
}) {
  // A full or closed tournament is still shown: its page may take a
  // waiting-list request, so the card says so instead of hiding it.
  const closedLabel = x.isFull ? t('full') : !x.registrationOpen ? t('closed') : null;
  const tags = [x.levelName, x.gender && t(`gender.${x.gender}`), x.discipline && t(`discipline.${x.discipline}`)].filter(
    (v): v is string => Boolean(v),
  );
  const place = [x.venue, x.city].filter(Boolean).join(' · ');

  return (
    <article
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '16 / 10', background: 'var(--surface-2)' }}>
        {x.image && (
          <img
            src={x.image}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
        {closedLabel && (
          <span
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              padding: '6px 12px',
              borderRadius: 'var(--pill)',
              background: 'var(--ink)',
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            {closedLabel}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 18, flex: 1 }}>
        <div className="mono" style={{ fontSize: 12.5, color: 'var(--green)', textTransform: 'capitalize' }}>
          {date}
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, lineHeight: 1.25 }}>{x.name}</h2>
        {place && <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>{place}</div>}

        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  padding: '5px 11px',
                  borderRadius: 'var(--pill)',
                  background: 'var(--green-soft)',
                  color: 'var(--green-deep)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <dl style={{ display: 'grid', gap: 4, fontSize: 14, color: 'var(--ink-2)', margin: 0 }}>
          {x.matchFormat && <Fact label={t('format')} value={x.matchFormat} />}
          {price && <Fact label={t('fee')} value={price} />}
          {x.capacity !== null && (
            <Fact
              label={t('places')}
              value={
                !x.isFull && x.spotsLeft !== null
                  ? t('spotsLeft', { left: x.spotsLeft, capacity: x.capacity })
                  : t('registeredOf', { registered: x.registered, capacity: x.capacity })
              }
            />
          )}
        </dl>

        <a
          href={x.registerUrl}
          target="_blank"
          rel="noopener"
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 46,
            borderRadius: 'var(--pill)',
            fontWeight: 700,
            textDecoration: 'none',
            ...(closedLabel
              ? { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-2)' }
              : { background: 'var(--lime)', color: 'var(--on-lime)' }),
          }}
        >
          {closedLabel ? t('view') : t('register')}
          <span className="sr-only" style={{ position: 'absolute', left: -9999 }}>
            {' '}
            — {x.name} ({t('opensSmileCup')})
          </span>
        </a>
      </div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
      <dt style={{ color: 'var(--ink-3)' }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>{value}</dd>
    </div>
  );
}

const noticeBox: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px dashed var(--line-2)',
  borderRadius: 'var(--radius)',
  padding: 24,
  color: 'var(--ink-2)',
};
