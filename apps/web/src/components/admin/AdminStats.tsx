'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { AdminStatsDto, CoachStatDto, DailyStatDto } from '@playslot/contracts';
import { getAdminStats, platformListClubs } from '@/lib/api';

type Preset = 'today' | 'week' | 'month' | 'last30' | 'lastMonth' | 'custom';

/** Local (Sofia) calendar date helpers — the API works in Europe/Sofia days. */
const sofiaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function rangeFor(p: Preset, custom: { from: string; to: string }): { from: string; to: string } {
  const today = sofiaToday();
  const wd = new Date(`${today}T00:00:00Z`).getUTCDay();
  switch (p) {
    case 'today':
      return { from: today, to: today };
    case 'week':
      return { from: addDays(today, -((wd + 6) % 7)), to: today };
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'lastMonth': {
      const firstThis = `${today.slice(0, 8)}01`;
      const lastPrev = addDays(firstThis, -1);
      return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
    }
    default:
      return custom;
  }
}

/**
 * Admin summary: money (today / week / month / period), bookings, users and
 * the top coaches. Platform admins see everything (optionally one club); a
 * club admin sees their club only.
 */
export function AdminStats({ scope, clubId }: { scope: 'platform' | 'club'; clubId?: number }) {
  const t = useTranslations('Stats');
  const locale = useLocale();
  const nf = locale === 'bg' ? 'bg-BG' : 'en-US';

  const [preset, setPreset] = useState<Preset>('month');
  const [custom, setCustom] = useState(() => ({ from: addDays(sofiaToday(), -6), to: sofiaToday() }));
  const [clubFilter, setClubFilter] = useState<number | undefined>(undefined);
  const range = rangeFor(preset, custom);
  const effectiveClub = scope === 'club' ? clubId : clubFilter;

  const clubs = useQuery({ queryKey: ['platformClubs'], queryFn: platformListClubs, enabled: scope === 'platform' });
  const stats = useQuery({
    queryKey: ['adminStats', scope, effectiveClub, range.from, range.to],
    queryFn: () => getAdminStats({ scope, clubId: effectiveClub, ...range }),
    enabled: range.from <= range.to,
    placeholderData: (prev) => prev,
  });

  const s = stats.data;
  const money = (cents: number) =>
    new Intl.NumberFormat(nf, { style: 'currency', currency: s?.currency ?? 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
  const num = (n: number) => new Intl.NumberFormat(nf).format(n);
  const df = new Intl.DateTimeFormat(nf, { day: 'numeric', month: 'short' });
  const fmtDay = (iso: string) => df.format(new Date(`${iso}T12:00:00Z`));

  return (
    <section style={{ ...card, borderColor: 'var(--green-deep)' }} aria-busy={stats.isFetching}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>{t('title')}</h2>
        {s && (
          <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 12 }}>
            {fmtDay(s.range.from)} – {fmtDay(s.range.to)} · {t('tzNote')}
          </span>
        )}
      </div>

      {/* ── filters: one row ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0 18px' }}>
        {(['today', 'week', 'month', 'lastMonth', 'last30', 'custom'] as const).map((p) => (
          <button key={p} type="button" onClick={() => setPreset(p)} aria-pressed={preset === p} style={chip(preset === p)}>
            {t(`presets.${p}`)}
          </button>
        ))}
        {preset === 'custom' && (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input
              type="date"
              value={custom.from}
              max={custom.to}
              onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))}
              aria-label={t('from')}
              style={dateInput}
            />
            <span style={{ color: 'var(--ink-3)' }}>–</span>
            <input
              type="date"
              value={custom.to}
              min={custom.from}
              max={sofiaToday()}
              onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))}
              aria-label={t('to')}
              style={dateInput}
            />
          </span>
        )}
        {scope === 'platform' && (
          <select
            value={clubFilter ?? ''}
            onChange={(e) => setClubFilter(e.target.value ? Number(e.target.value) : undefined)}
            aria-label={t('club')}
            style={{ ...dateInput, marginLeft: 'auto' }}
          >
            <option value="">{t('allClubs')}</option>
            {clubs.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {stats.isError && <p style={{ color: 'var(--clay)' }}>{(stats.error as Error).message}</p>}
      {!s && stats.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}

      {s && (
        <div style={{ opacity: stats.isFetching ? 0.6 : 1, transition: 'opacity .15s' }}>
          {/* ── money ── */}
          <h3 style={h3}>{t('moneyTitle')}</h3>
          <div style={grid}>
            <Tile label={t('today')} value={money(s.revenue.todayCents)} />
            <Tile label={t('thisWeek')} value={money(s.revenue.weekCents)} />
            <Tile label={t('thisMonth')} value={money(s.revenue.monthCents)} />
            <Tile
              label={t('period')}
              value={money(s.revenue.periodCents)}
              hint={[
                s.revenue.groupCents > 0 ? t('ofWhichGroup', { amount: money(s.revenue.groupCents) }) : null,
                s.revenue.pendingCents > 0 ? t('pending', { amount: money(s.revenue.pendingCents) }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              emphasis
            />
          </div>

          <DailyBars daily={s.daily} money={money} fmtDay={fmtDay} t={t} />

          {/* ── bookings ── */}
          <h3 style={h3}>{t('bookingsTitle')}</h3>
          <div style={grid}>
            <Tile label={t('today')} value={num(s.bookings.today)} />
            <Tile label={t('thisWeek')} value={num(s.bookings.week)} />
            <Tile label={t('thisMonth')} value={num(s.bookings.month)} />
            <Tile
              label={t('period')}
              value={num(s.bookings.period + s.bookings.groupSignups)}
              hint={t('bookingsBreakdown', {
                courts: s.bookings.courts,
                lessons: s.bookings.lessons,
                group: s.bookings.groupSignups,
              })}
              emphasis
            />
          </div>
          <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 8 }}>
            {t('lossLine', { cancelled: s.bookings.cancelled, noShows: s.bookings.noShows })}
          </p>

          {/* ── users ── */}
          <h3 style={h3}>{s.scope === 'club' ? t('customersTitle') : t('usersTitle')}</h3>
          <div style={grid}>
            <Tile label={s.scope === 'club' ? t('totalCustomers') : t('totalUsers')} value={num(s.users.total)} />
            <Tile label={t('newPeriod')} value={num(s.users.newPeriod)} emphasis hint={t('newHint', { today: s.users.newToday, week: s.users.newWeek, month: s.users.newMonth })} />
            <Tile label={t('activePeriod')} value={num(s.users.activePeriod)} hint={t('activeHint')} />
            {s.users.suspended !== null && <Tile label={t('suspended')} value={num(s.users.suspended)} />}
          </div>
          {s.scope === 'club' && <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 8 }}>{t('clubUsersNote')}</p>}

          {/* ── coaches ── */}
          <h3 style={h3}>{t('coachesTitle')}</h3>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <CoachTop title={t('topByHours')} rows={s.topCoaches.byHours} value={(c) => t('hours', { n: c.hours })} empty={t('noCoachData')} />
            <CoachTop title={t('topByRevenue')} rows={s.topCoaches.byRevenue} value={(c) => money(c.revenueCents)} empty={t('noCoachData')} />
            <CoachTop
              title={t('topByLessons')}
              rows={s.topCoaches.byLessons}
              value={(c) => num(c.lessons + c.groupSessions)}
              sub={(c) => t('lessonsSplit', { lessons: c.lessons, group: c.groupSessions })}
              empty={t('noCoachData')}
            />
          </div>
          <p style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 12 }}>{t('footnote')}</p>
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, hint, emphasis }: { label: string; value: string; hint?: string; emphasis?: boolean }) {
  return (
    <div
      style={{
        border: `1px solid ${emphasis ? 'var(--green-deep)' : 'var(--line)'}`,
        borderRadius: 'var(--radius-sm)',
        padding: '12px 14px',
        background: emphasis ? 'var(--teal-soft)' : 'var(--surface-2)',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)', marginTop: 2 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function CoachTop({
  title,
  rows,
  value,
  sub,
  empty,
}: {
  title: string;
  rows: CoachStatDto[];
  value: (c: CoachStatDto) => string;
  sub?: (c: CoachStatDto) => string;
  empty: string;
}) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', background: 'var(--surface-2)' }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{title}</div>
      {rows.length === 0 && <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>{empty}</div>}
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
        {rows.map((c, i) => (
          <li key={c.coachProfileId} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 12, width: 16 }}>
              {i + 1}.
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: i === 0 ? 700 : 500 }}>{c.name}</span>
              {sub && <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 12 }}>{sub(c)}</span>}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{value(c)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Revenue per day for the period: one series, one hue, hover for detail. */
function DailyBars({
  daily,
  money,
  fmtDay,
  t,
}: {
  daily: DailyStatDto[];
  money: (c: number) => string;
  fmtDay: (iso: string) => string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const max = useMemo(() => Math.max(1, ...daily.map((d) => d.revenueCents)), [daily]);
  if (daily.length < 2) return null;

  const H = 120;
  const gap = 2;
  const W = 100; // viewBox width in %, bars computed as fractions
  const bw = W / daily.length;
  const labelEvery = Math.ceil(daily.length / 8);
  const hovered = hover !== null ? daily[hover] : null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{t('dailyRevenue')}</span>
        <button type="button" onClick={() => setShowTable((v) => !v)} style={linkBtn}>
          {showTable ? t('showChart') : t('showTable')}
        </button>
      </div>

      {showTable ? (
        <div style={{ maxHeight: 240, overflow: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--ink-2)', textAlign: 'left' }}>
                <th style={th}>{t('date')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('revenue')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('bookingsCol')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('newUsersCol')}</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.date} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={td}>{fmtDay(d.date)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{money(d.revenueCents)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{d.bookings}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{d.newUsers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: 'relative', marginTop: 8 }} onMouseLeave={() => setHover(null)}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={t('dailyRevenue')}
            style={{ width: '100%', height: H, display: 'block' }}
          >
            <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--line-2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {daily.map((d, i) => {
              const h = d.revenueCents === 0 ? 0 : Math.max(2, (d.revenueCents / max) * (H - 8));
              return (
                <g key={d.date}>
                  {/* hit target: the full column, bigger than the bar */}
                  <rect
                    x={i * bw}
                    y={0}
                    width={bw}
                    height={H}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    tabIndex={0}
                    aria-label={`${fmtDay(d.date)}: ${money(d.revenueCents)}`}
                  />
                  <rect
                    x={i * bw + gap / 10}
                    y={H - h}
                    width={Math.max(0.2, bw - (gap / 10) * 2)}
                    height={h}
                    rx={0.6}
                    fill={hover === i ? 'var(--green-deep)' : 'var(--teal)'}
                    pointerEvents="none"
                  />
                </g>
              );
            })}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {daily.map((d, i) =>
              i % labelEvery === 0 ? (
                <span key={d.date} className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  {fmtDay(d.date)}
                </span>
              ) : null,
            )}
          </div>
          {hovered && hover !== null && (
            <div
              role="status"
              style={{
                position: 'absolute',
                top: -6,
                left: `clamp(0px, calc(${((hover + 0.5) / daily.length) * 100}% - 80px), calc(100% - 160px))`,
                width: 160,
                background: 'var(--surface)',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-sm)',
                padding: '8px 10px',
                fontSize: 12,
                pointerEvents: 'none',
              }}
            >
              <div style={{ fontWeight: 700 }}>{fmtDay(hovered.date)}</div>
              <div>{money(hovered.revenueCents)}</div>
              <div style={{ color: 'var(--ink-3)' }}>
                {t('tooltipCounts', { bookings: hovered.bookings, users: hovered.newUsers })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 20,
  marginBottom: 28,
};
const h3: React.CSSProperties = { fontSize: 15, fontWeight: 700, margin: '20px 0 10px' };
const grid: React.CSSProperties = { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' };
const chip = (on: boolean): React.CSSProperties => ({
  minHeight: 36,
  padding: '0 14px',
  borderRadius: 'var(--pill)',
  border: `1px solid ${on ? 'var(--green-deep)' : 'var(--line-2)'}`,
  background: on ? 'var(--green-deep)' : 'var(--surface)',
  color: on ? '#fff' : 'var(--ink)',
  cursor: 'pointer',
  fontSize: 13,
});
const dateInput: React.CSSProperties = {
  minHeight: 36,
  padding: '0 10px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
  fontSize: 13,
};
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, color: 'var(--teal)', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const th: React.CSSProperties = { padding: '6px 4px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '6px 4px', fontVariantNumeric: 'tabular-nums' };
