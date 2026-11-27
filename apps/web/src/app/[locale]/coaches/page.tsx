import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { enumLabel } from '@/lib/enums';
import { isAppLocale } from '@/i18n/routing';
import { pageMetadata } from '@/lib/seo';
import { Link } from '@/i18n/navigation';
import { AvatarZoom } from '@/components/AvatarZoom';
import { SiteHeader } from '@/components/SiteHeader';
import { getCoaches } from '@/lib/api';

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
    path: '/coaches',
    title: t('coaches.title'),
    description: t('coaches.description'),
  });
}

export default async function CoachesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Coaches');
  const lv = await getTranslations('Levels');
  const ag = await getTranslations('AgeGroups');
  const te = await getTranslations('Enums');
  const level = (l: string) => (lv.has(l) ? lv(l) : l);
  const ageGroup = (g: string) => (ag.has(g) ? ag(g) : g);
  const coaches = (await getCoaches()) ?? [];
  const money = (cents: number) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-GB', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: cents % 100 ? 2 : 0,
    }).format(cents / 100);

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '32px 20px 64px' }}>
        <h1 className="cdir-h1">
          {t('title')}
          {coaches.length > 0 && <span>{coaches.length}</span>}
        </h1>
        <p style={{ color: 'var(--ink-2)', margin: '8px 0 24px' }}>{t('subtitle')}</p>

        {coaches.length === 0 ? (
          <p className="gs-empty">{t('empty')}</p>
        ) : (
          <div className="cdir-grid">
            {coaches.map((coach) => {
              // The lowest price says "from"; a coach with no services listed shows none.
              const prices = coach.services.map((sv) => sv.priceCents);
              const from = prices.length ? Math.min(...prices) : null;
              const about = [
                ...coach.worksWith.map((g) => ({ key: `w-${g}`, label: ageGroup(g), tone: ' is-age' })),
                ...coach.levels.map((l) => ({ key: `l-${l}`, label: level(l), tone: ' is-level' })),
                ...coach.languages.map((l) => ({ key: `g-${l}`, label: enumLabel(te, 'Language', l), tone: '' })),
              ];
              return (
                <Link key={coach.coachProfileId} href={`/coaches/${coach.coachProfileId}`} className="cdir-card">
                  <span className="cdir-top">
                    <AvatarZoom name={coach.name} photoUrl={coach.photoUrl} size={64} />
                    <span className="cdir-who">
                      <span className="cdir-name">{coach.name}</span>
                      <span className="cdir-club">{coach.clubs.map((c) => c.name).join(' · ')}</span>
                    </span>
                  </span>

                  {(coach.ratingAvg != null || coach.experienceYears != null) && (
                    <span className="cdir-facts">
                      {coach.ratingAvg != null && (
                        <span className="cdir-rating">
                          <i aria-hidden>★</i> <b>{coach.ratingAvg.toFixed(1)}</b>{' '}
                          <small>({t('ratingCount', { count: coach.ratingCount })})</small>
                        </span>
                      )}
                      {coach.experienceYears != null && <span className="cdir-exp">{t('yearsExp', { n: coach.experienceYears })}</span>}
                    </span>
                  )}

                  {coach.bio && <span className="cdir-bio">{coach.bio}</span>}

                  {about.length > 0 && (
                    <span className="cdir-tags">
                      {about.map((a) => (
                        <span key={a.key} className={`gs-tag${a.tone}`}>
                          {a.label}
                        </span>
                      ))}
                    </span>
                  )}

                  <span className="cdir-foot">
                    {from != null ? (
                      <span className="cdir-price">
                        <small>{t('from')}</small> {money(from)}
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="cdir-go">
                      {t('viewProfile')}
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="m5 3 4 4-4 4" />
                      </svg>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
