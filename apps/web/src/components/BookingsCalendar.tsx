'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { ReservationSummary } from '@playslot/contracts';

/** YYYY-MM-DD of a moment, in the viewer's own time zone. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;

/** Colour of a booking's dot/chip — the same tokens the club calendar uses. */
function tone(status: string): string {
  if (status === 'CONFIRMED') return 'mine';
  if (status === 'HOLD' || status === 'PENDING_PAYMENT' || status === 'PENDING_APPROVAL') return 'held';
  return 'past';
}

/**
 * My bookings as a month: each day shows its bookings (a chip with the time on
 * a wide screen, a dot on a phone); picking a day lists that day's bookings
 * below, rendered by the same row as the list view.
 */
export function BookingsCalendar({
  bookings,
  renderRow,
}: {
  bookings: ReservationSummary[];
  renderRow: (r: ReservationSummary) => React.ReactNode;
}) {
  const t = useTranslations('MyBookings');
  const locale = useLocale();
  const loc = locale === 'bg' ? 'bg-BG' : 'en-GB';
  const today = new Date();
  const todayKey = dayKey(today);

  const byDay = useMemo(() => {
    const map = new Map<string, ReservationSummary[]>();
    for (const r of [...bookings].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      const k = dayKey(new Date(r.startsAt));
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return map;
  }, [bookings]);

  // Open on the month of the next booking (or this month when there is none).
  const next = bookings
    .filter((r) => new Date(r.startsAt).getTime() >= today.getTime() && r.status !== 'CANCELLED')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const start = next ? new Date(next.startsAt) : today;
  const [view, setView] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1));
  const [selected, setSelected] = useState<string>(() => (next ? dayKey(new Date(next.startsAt)) : todayKey));

  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: mondayIndex(first) }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const rawMonth = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' }).format(view);
  // Only the first letter: CSS `capitalize` also turned "г." into "Г.".
  const monthLabel = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(loc, { weekday: 'short' }).format(new Date(2024, 0, 1 + i)),
  );
  const time = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' });
  const selectedLabel = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(`${selected}T12:00:00`),
  );
  const shift = (n: number) => setView((v) => new Date(v.getFullYear(), v.getMonth() + n, 1));
  const dayList = byDay.get(selected) ?? [];
  const inMonth = [...byDay.keys()].some((k) => k.startsWith(dayKey(first).slice(0, 7)));

  return (
    // Wide screens: the month on the left, the picked day's bookings beside
    // it. Narrow screens: the day's bookings under the month.
    <div className="bcal-layout">
      <div className="bcal">
        <div className="bcal-head">
          <button type="button" className="bcal-nav" onClick={() => shift(-1)} aria-label={t('prevMonth')}>
            ‹
          </button>
          <div className="bcal-month">{monthLabel}</div>
          <button type="button" className="bcal-nav" onClick={() => shift(1)} aria-label={t('nextMonth')}>
            ›
          </button>
        </div>
        <div className="bcal-grid" role="grid" aria-label={monthLabel}>
          {weekdays.map((w) => (
            <div key={w} className="bcal-wd mono" role="columnheader">
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} className="bcal-cell is-empty" aria-hidden />;
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            const live = list.filter((r) => r.status !== 'CANCELLED');
            return (
              <button
                key={k}
                type="button"
                role="gridcell"
                aria-selected={k === selected}
                aria-label={`${d.getDate()} — ${t('bookingsCount', { count: live.length })}`}
                onClick={() => setSelected(k)}
                className={`bcal-cell${k === selected ? ' is-selected' : ''}${k === todayKey ? ' is-today' : ''}${live.length ? ' has-bookings' : ''}${k < todayKey ? ' is-past' : ''}`}
              >
                <span className="bcal-day">{d.getDate()}</span>
                {/* Wide screens: a chip per booking (up to two); phones: dots. */}
                <span className="bcal-chips">
                  {live.slice(0, 2).map((r) => (
                    <span key={r.id} className={`bcal-chip tone-${tone(r.status)}`}>
                      {time.format(new Date(r.startsAt))}
                    </span>
                  ))}
                  {live.length > 2 && <span className="bcal-more">+{live.length - 2}</span>}
                </span>
                <span className="bcal-dots" aria-hidden>
                  {live.slice(0, 3).map((r) => (
                    <i key={r.id} className={`tone-${tone(r.status)}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        {!inMonth && <p className="bcal-none">{t('noneThisMonth')}</p>}
      </div>

      <section className="bcal-daypanel" aria-live="polite">
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, textTransform: 'none' }}>
          {selectedLabel.charAt(0).toUpperCase() + selectedLabel.slice(1)}
        </h2>
        {dayList.length === 0 ? (
          <p style={{ color: 'var(--ink-2)' }}>{t('noneThisDay')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>{dayList.map(renderRow)}</div>
        )}
      </section>
    </div>
  );
}
