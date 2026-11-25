'use client';

import { useTranslations } from 'next-intl';
import type { CoachListItem } from '@playslot/contracts';
import { Avatar } from '@/components/Avatar';

/**
 * "With a coach?" in the booking dialog: one row per coach free at the picked
 * hour — photo, name, rating, experience and price — instead of a bare list of
 * names, so a player who knows none of them still has something to choose by.
 * The first row is always "no coach" (court only).
 */
export function CoachPicker({
  coaches,
  coachId,
  serviceId,
  onChange,
  formatMoney,
}: {
  coaches: CoachListItem[];
  coachId: number | null;
  serviceId: number | null;
  /** A coach always comes with one of their services (the first, until another is picked). */
  onChange: (coachId: number | null, serviceId: number | null) => void;
  formatMoney: (cents: number) => string;
}) {
  const bk = useTranslations('Booking');
  const tc = useTranslations('Coaches');

  return (
    <div role="radiogroup" aria-label={bk('coach')} className="bk-coaches">
      <button
        type="button"
        role="radio"
        aria-checked={coachId === null}
        className={`bk-coach-head bk-coach${coachId === null ? ' is-on' : ''}`}
        onClick={() => onChange(null, null)}
      >
        <span className="bk-coach-dot" aria-hidden />
        <span className="bk-coach-none" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="5" width="18" height="14" rx="1.5" />
            <path d="M12 5v14M3 12h18" />
          </svg>
        </span>
        <span className="bk-coach-main">
          <strong>{bk('noCoach')}</strong>
          <span className="bk-coach-sub">{bk('noCoachHelp')}</span>
        </span>
      </button>

      {coaches.map((c) => {
        const on = c.coachProfileId === coachId;
        const cheapest = c.services.length ? Math.min(...c.services.map((s) => s.priceCents)) : null;
        const chosen = on ? (c.services.find((s) => s.id === serviceId) ?? null) : null;
        return (
          <div key={c.coachProfileId} className={`bk-coach${on ? ' is-on' : ''}`}>
            <button
              type="button"
              role="radio"
              aria-checked={on}
              className="bk-coach-head"
              onClick={() => onChange(c.coachProfileId, c.services[0]?.id ?? null)}
            >
              <span className="bk-coach-dot" aria-hidden />
              <Avatar name={c.name} photoUrl={c.photoUrl} size={48} />
              <span className="bk-coach-main">
                <strong>{c.name}</strong>
                <span className="bk-coach-sub">
                  {c.ratingAvg != null ? (
                    <>
                      <span className="bk-coach-star" aria-hidden>
                        ★
                      </span>{' '}
                      <b>{c.ratingAvg.toFixed(1)}</b> · {tc('ratingCount', { count: c.ratingCount })}
                    </>
                  ) : (
                    tc('noRatingsYet')
                  )}
                  {c.experienceYears != null && c.experienceYears > 0 && (
                    <> · {tc('yearsExp', { n: c.experienceYears })}</>
                  )}
                </span>
              </span>
              {cheapest != null && (
                <span className="bk-coach-price">
                  {chosen
                    ? formatMoney(chosen.priceCents)
                    : c.services.length > 1
                      ? bk('priceFrom', { price: formatMoney(cheapest) })
                      : formatMoney(cheapest)}
                </span>
              )}
            </button>

            {/* The coach's services, once picked: what exactly is being booked. */}
            {on && c.services.length > 0 && (
              <div role="radiogroup" aria-label={bk('service')} className="bk-coach-services">
                {c.services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={s.id === serviceId}
                    className={`bk-coach-service${s.id === serviceId ? ' is-on' : ''}`}
                    onClick={() => onChange(c.coachProfileId, s.id)}
                  >
                    {s.name} · {formatMoney(s.priceCents)}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
