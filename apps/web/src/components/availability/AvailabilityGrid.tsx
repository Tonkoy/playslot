'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { AvailabilitySlot, SlotState } from '@playslot/contracts';
import { fetchAvailability } from '@/lib/api';

// State → design token + non-color cue (icon). Never color-only (spec §7/§20).
const STATE_STYLE: Record<SlotState, { bg: string; fg: string; icon: string; bookable: boolean }> = {
  FREE: { bg: 'var(--free-soft)', fg: 'var(--free)', icon: '✓', bookable: true },
  RESERVED: { bg: 'var(--booked-soft)', fg: 'var(--booked)', icon: '×', bookable: false },
  MINE: { bg: 'var(--teal-soft)', fg: 'var(--teal)', icon: '★', bookable: false },
  UNAVAILABLE: { bg: 'var(--booked-soft)', fg: 'var(--ink-3)', icon: '–', bookable: false },
  PAST: { bg: 'var(--booked-soft)', fg: 'var(--ink-3)', icon: '·', bookable: false },
  EVENT: { bg: 'var(--event-soft)', fg: 'var(--event)', icon: '◆', bookable: false },
  TOURNAMENT: { bg: 'var(--event-soft)', fg: 'var(--event)', icon: '⚑', bookable: false },
};

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

/** HH:mm from an ISO string carrying the club offset (local wall-clock time). */
const hhmm = (iso: string) => iso.slice(11, 16);

export function AvailabilityGrid({ clubId }: { clubId: number }) {
  const t = useTranslations('Grid');
  const st = useTranslations('SlotStates');
  const locale = useLocale();
  const [date, setDate] = useState(todayIso());
  const [duration, setDuration] = useState(60);

  const query = useQuery({
    queryKey: ['availability', clubId, date, duration],
    queryFn: () => fetchAvailability({ clubId, date, duration }),
  });

  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', {
        style: 'currency',
        currency: query.data?.currency ?? 'EUR',
        maximumFractionDigits: 0,
      }),
    [locale, query.data?.currency],
  );

  // Build the time-row × court-column matrix.
  const { rows, byKey } = useMemo(() => {
    const slots = query.data?.slots ?? [];
    const times = [...new Set(slots.map((s) => hhmm(s.start)))].sort();
    const map = new Map<string, AvailabilitySlot>();
    for (const s of slots) map.set(`${s.resourceId}@${hhmm(s.start)}`, s);
    return { rows: times, byKey: map };
  }, [query.data]);

  const courts = query.data?.courts ?? [];
  // Booking-length options adapt to the club's slot time (30 → allow 30-min).
  const durations = (query.data?.slotIntervalMin ?? 60) === 30 ? [30, 60, 90, 120] : [60, 90, 120];

  return (
    <section aria-labelledby="grid-heading" style={{ marginTop: 8 }}>
      {/* Controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <button type="button" onClick={() => setDate(shiftDate(date, -1))} style={navBtn} aria-label={t('prevDay')}>
            ‹
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || todayIso())}
            style={dateInput}
            aria-label={t('date')}
          />
          <button type="button" onClick={() => setDate(shiftDate(date, 1))} style={navBtn} aria-label={t('nextDay')}>
            ›
          </button>
          <button type="button" onClick={() => setDate(todayIso())} style={todayBtn}>
            {t('today')}
          </button>
        </div>

        <label className="mono" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: 'var(--ink-3)' }}>{t('duration')}</span>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            style={dateInput}
          >
            {durations.map((d) => (
              <option key={d} value={d}>
                {d} {t('minutes')}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h2 id="grid-heading" className="sr-only" style={{ position: 'absolute', left: -9999 }}>
        {t('heading')}
      </h2>

      {/* States */}
      {query.isLoading && <GridSkeleton />}
      {query.isError && (
        <div role="alert" style={alertBox}>
          {t('error')}{' '}
          <button type="button" onClick={() => query.refetch()} style={{ ...todayBtn, marginLeft: 8 }}>
            {t('retry')}
          </button>
        </div>
      )}

      {query.isSuccess && courts.length === 0 && <div style={emptyBox}>{t('noCourts')}</div>}

      {query.isSuccess && courts.length > 0 && rows.length === 0 && (
        <div style={emptyBox}>{t('noSlots')}</div>
      )}

      {query.isSuccess && rows.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--radius)' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 120 + courts.length * 116 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--surface-2)', zIndex: 2 }}>
                  {t('time')}
                </th>
                {courts.map((c) => (
                  <th key={c.id} style={thStyle}>
                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500 }}>
                      {[c.surface, c.isIndoor ? t('indoor') : t('outdoor')].filter(Boolean).join(' · ')}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((time) => (
                <tr key={time}>
                  <th
                    scope="row"
                    className="mono"
                    style={{ ...timeCell, position: 'sticky', left: 0, background: 'var(--surface-2)', zIndex: 1 }}
                  >
                    {time}
                  </th>
                  {courts.map((c) => {
                    const slot = byKey.get(`${c.id}@${time}`);
                    if (!slot) return <td key={c.id} style={{ ...cell, background: 'var(--ground)' }} aria-hidden />;
                    const s = STATE_STYLE[slot.state];
                    return (
                      <td key={c.id} style={cell}>
                        <div
                          title={st(slot.state)}
                          style={{
                            background: s.bg,
                            border: '1px solid var(--line)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '8px 8px',
                            minHeight: 52,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                            cursor: s.bookable ? 'pointer' : 'default',
                          }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span aria-hidden className="mono" style={{ color: s.fg, fontWeight: 700 }}>
                              {s.icon}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{st(slot.state)}</span>
                          </span>
                          {s.bookable && slot.priceCents != null && (
                            <span style={{ fontWeight: 700, fontSize: 14 }}>
                              {money.format(slot.priceCents / 100)}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function GridSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 8 }} aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          style={{ height: 52, background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', opacity: 1 - i * 0.12 }}
        />
      ))}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 18,
  cursor: 'pointer',
};
const todayBtn: React.CSSProperties = {
  minHeight: 44,
  padding: '0 14px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  fontWeight: 600,
};
const dateInput: React.CSSProperties = {
  minHeight: 44,
  padding: '0 10px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
};
const thStyle: React.CSSProperties = {
  padding: '10px 8px',
  borderBottom: '1px solid var(--line)',
  fontSize: 13,
  textAlign: 'center',
  background: 'var(--surface-2)',
  whiteSpace: 'nowrap',
};
const timeCell: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  color: 'var(--ink-2)',
  borderBottom: '1px solid var(--line)',
  textAlign: 'right',
  whiteSpace: 'nowrap',
};
const cell: React.CSSProperties = { padding: 4, borderBottom: '1px solid var(--line)', verticalAlign: 'top' };
const alertBox: React.CSSProperties = {
  background: 'var(--clay-soft)',
  color: 'var(--ink)',
  border: '1px solid var(--clay)',
  borderRadius: 'var(--radius-sm)',
  padding: '12px 14px',
};
const emptyBox: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px dashed var(--line-2)',
  borderRadius: 'var(--radius)',
  padding: '20px',
  color: 'var(--ink-2)',
  textAlign: 'center',
};
