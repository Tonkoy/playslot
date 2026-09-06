'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { SPORTS } from '@playslot/contracts';
import { Link } from '@/i18n/navigation';
import { searchAvailability } from '@/lib/api';

function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

const DURATIONS = [60, 90, 120];

export function SearchClient() {
  const t = useTranslations('Search');
  const locale = useLocale();
  const [date, setDate] = useState(todayIso());
  const [sport, setSport] = useState('');
  const [duration, setDuration] = useState(60);

  const query = useQuery({
    queryKey: ['search', date, sport, duration],
    queryFn: () => searchAvailability({ date, sport: sport || undefined, duration }),
  });

  const money = (cents: number, ccy: string) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', {
      style: 'currency',
      currency: ccy,
      maximumFractionDigits: 0,
    }).format(cents / 100);

  const results = query.data?.results ?? [];

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 20 }}>
        <label style={field}>
          {t('date')}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayIso())} style={ctrl} />
        </label>
        <label style={field}>
          {t('sport')}
          <select value={sport} onChange={(e) => setSport(e.target.value)} style={ctrl}>
            <option value="">{t('anySport')}</option>
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label style={field}>
          {t('duration')}
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={ctrl}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} {t('minutes')}
              </option>
            ))}
          </select>
        </label>
      </div>

      {query.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}
      {query.isSuccess && results.length === 0 && <p style={{ color: 'var(--ink-2)' }}>{t('empty')}</p>}

      <div style={{ display: 'grid', gap: 12 }}>
        {results.map((r) => (
          <Link
            key={r.club.id}
            href={`/clubs/${r.club.slug}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              textDecoration: 'none',
              color: 'var(--ink)',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius)',
              padding: 16,
              boxShadow: 'var(--shadow-sm)',
              opacity: r.freeCount === 0 ? 0.6 : 1,
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{r.club.name}</div>
              <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 4 }}>
                {r.club.cityName}
                {r.club.surfaces.length ? ` · ${r.club.surfaces.join(', ')}` : ''}
              </div>
              {r.sampleTimes.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {r.sampleTimes.map((tm) => (
                    <span key={tm} className="mono" style={chip}>
                      {tm}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, color: r.freeCount ? 'var(--free)' : 'var(--ink-3)' }}>
                {t('freeSlots', { count: r.freeCount })}
              </div>
              {r.fromPriceCents != null && (
                <div className="mono" style={{ color: 'var(--ink-2)', fontSize: 13 }}>
                  {t('from')} {money(r.fromPriceCents, r.currency)}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-2)' };
const ctrl: React.CSSProperties = {
  minHeight: 44,
  padding: '0 10px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
};
const chip: React.CSSProperties = {
  fontSize: 12,
  background: 'var(--free-soft)',
  color: 'var(--free)',
  borderRadius: 100,
  padding: '3px 10px',
};
