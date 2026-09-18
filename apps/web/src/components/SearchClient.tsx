'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { SPORTS } from '@playslot/contracts';
import { Link } from '@/i18n/navigation';
import { getCities, searchAvailability } from '@/lib/api';
import { DatePicker } from './DatePicker';

function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// Time-of-day presets → [earliest, latest] local start minute.
const TIME_PRESETS: Record<string, [number, number] | null> = {
  any: null,
  morning: [360, 720], // 06:00–12:00
  afternoon: [720, 1020], // 12:00–17:00
  evening: [1020, 1320], // 17:00–22:00
};

interface Applied {
  date: string;
  cityId?: number;
  sport?: string;
  startMin?: number;
  endMin?: number;
}

export function SearchClient() {
  const t = useTranslations('Search');
  const locale = useLocale();

  const cities = useQuery({ queryKey: ['cities'], queryFn: getCities });

  const [cityId, setCityId] = useState<number | ''>('');
  const [sport, setSport] = useState('TENNIS');
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState('any');
  const [applied, setApplied] = useState<Applied>({ date: todayIso(), sport: 'TENNIS' });

  // Default the location to Sofia once cities load (the app's one launch
  // market) rather than leaving the field visibly empty.
  useEffect(() => {
    if (cityId !== '' || !cities.data) return;
    const sofia = cities.data.find((c) => /sofia|софия/i.test(c.name));
    if (!sofia) return;
    setCityId(sofia.id);
    setApplied((a) => ({ ...a, cityId: sofia.id }));
  }, [cities.data, cityId]);

  const query = useQuery({
    queryKey: ['search', applied],
    queryFn: () => searchAvailability(applied),
  });

  const submit = () => {
    const win = TIME_PRESETS[time];
    setApplied({
      date: date || todayIso(),
      cityId: cityId === '' ? undefined : cityId,
      sport: sport || undefined,
      startMin: win?.[0],
      endMin: win?.[1],
    });
  };

  const money = (cents: number, ccy: string) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', {
      style: 'currency',
      currency: ccy,
      maximumFractionDigits: 0,
    }).format(cents / 100);

  const results = query.data?.results ?? [];

  return (
    <div>
      {/* ── search bar ── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow)',
            padding: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          {/* Location */}
          <label style={field}>
            <span style={labelText}>{t('location')}</span>
            <div style={{ position: 'relative' }}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="var(--ink-3)"
                strokeWidth="1.6"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                aria-hidden
              >
                <circle cx="7" cy="7" r="5" />
                <path d="m11 11 3.5 3.5" strokeLinecap="round" />
              </svg>
              <select
                value={cityId}
                onChange={(e) => setCityId(e.target.value === '' ? '' : Number(e.target.value))}
                style={{ ...ctrl, paddingLeft: 34, width: '100%' }}
              >
                <option value="">{t('anyCity')}</option>
                {cities.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </label>

          {/* Sport */}
          <label style={field}>
            <span style={labelText}>{t('sport')}</span>
            <select value={sport} onChange={(e) => setSport(e.target.value)} style={ctrl}>
              <option value="">{t('anySport')}</option>
              {SPORTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          {/* Date */}
          <label style={field}>
            <span style={labelText}>
              {t('date')} <span style={optionalText}>({t('optionalTag')})</span>
            </span>
            <DatePicker value={date} onChange={setDate} locale={locale} placeholder={t('anyDate')} />
          </label>

          {/* Time */}
          <label style={field}>
            <span style={labelText}>
              {t('time')} <span style={optionalText}>({t('optionalTag')})</span>
            </span>
            <select value={time} onChange={(e) => setTime(e.target.value)} style={ctrl}>
              <option value="any">{t('anyTime')}</option>
              <option value="morning">{t('morning')}</option>
              <option value="afternoon">{t('afternoon')}</option>
              <option value="evening">{t('evening')}</option>
            </select>
          </label>
        </div>

        <button
          type="submit"
          style={{
            width: '100%',
            minHeight: 48,
            marginTop: 14,
            background: 'var(--lime)',
            color: 'var(--on-lime)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 800,
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          {t('findCourt')}
        </button>
      </form>

      {/* ── results ── */}
      <div style={{ marginTop: 20 }}>
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
    </div>
  );
}

const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const labelText: React.CSSProperties = { fontWeight: 700, fontSize: 13, color: 'var(--ink)' };
const optionalText: React.CSSProperties = { fontWeight: 400, color: 'var(--ink-3)' };
const ctrl: React.CSSProperties = {
  minHeight: 46,
  padding: '0 12px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
  fontSize: 15,
};
const chip: React.CSSProperties = {
  fontSize: 12,
  background: 'var(--free-soft)',
  color: 'var(--free)',
  borderRadius: 100,
  padding: '3px 10px',
};
