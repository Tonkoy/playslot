'use client';

import { hashKey, keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { OFFERED_SPORTS } from '@playslot/contracts';
import { enumLabel } from '@/lib/enums';
import { ClubThumb } from './ClubThumb';
import { useSearchModal } from './SearchModalContext';
import { Link } from '@/i18n/navigation';
import { getCities, searchAvailability } from '@/lib/api';
import { DatePicker } from './DatePicker';
import { Spinner } from './Spinner';
import { useMinDuration } from '@/lib/useMinDuration';
import { SkeletonRows } from '@/components/Skeleton';

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
  const te = useTranslations('Enums');
  // The results live inside the search modal; picking one closes it right away
  // instead of waiting for the next route to paint.
  const { closeModal } = useSearchModal();

  const cities = useQuery({ queryKey: ['cities'], queryFn: () => getCities() });

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
    // A new search keeps the previous results on screen (dimmed) until the
    // new ones arrive, instead of collapsing the list to a skeleton.
    placeholderData: keepPreviousData,
  });
  // The button shows it is working for at least a moment, so a fast answer
  // still reads as "searched" rather than "nothing happened".
  const searching = useMinDuration(query.isFetching, 450);

  const submit = () => {
    const win = TIME_PRESETS[time];
    const next: Applied = {
      date: date || todayIso(),
      cityId: cityId === '' ? undefined : cityId,
      sport: sport || undefined,
      startMin: win?.[0],
      endMin: win?.[1],
    };
    // The same search again is a refresh: without this, the cached answer was
    // reused and the button looked like it did nothing.
    // (Compared the way React Query compares keys: field order does not matter.)
    if (hashKey([next]) === hashKey([applied])) void query.refetch();
    else setApplied(next);
  };

  const money = (cents: number, ccy: string) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', {
      style: 'currency',
      currency: ccy,
      maximumFractionDigits: 0,
    }).format(cents / 100);

  const results = query.data?.results ?? [];
  // The day the results on screen are for, said in words above them.
  const shownDay = new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${query.data?.date ?? applied.date}T12:00:00Z`));

  return (
    <div className="srch">
      {/* ── what to look for ── */}
      <form
        className="srch-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="srch-fields">
          <label className="srch-field">
            <span className="srch-label">{t('location')}</span>
            <span className="srch-select">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M8 14.5s4.5-4.3 4.5-7.9a4.5 4.5 0 0 0-9 0c0 3.6 4.5 7.9 4.5 7.9z" strokeLinejoin="round" />
                <circle cx="8" cy="6.5" r="1.6" />
              </svg>
              <select value={cityId} onChange={(e) => setCityId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">{t('anyCity')}</option>
                {cities.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <label className="srch-field">
            <span className="srch-label">{t('date')}</span>
            <DatePicker value={date} onChange={setDate} locale={locale} placeholder={t('anyDate')} />
          </label>
        </div>

        <div className="srch-fields">
          <Choice
            label={t('sport')}
            value={sport}
            onChange={setSport}
            options={[
              { value: '', title: t('anySportShort') },
              ...OFFERED_SPORTS.map((s) => ({ value: s as string, title: enumLabel(te, 'Sport', s) })),
            ]}
          />
          <Choice
            label={t('time')}
            value={time}
            onChange={setTime}
            options={[
              { value: 'any', title: t('anyTimeShort') },
              { value: 'morning', title: t('morningShort'), note: '06–12' },
              { value: 'afternoon', title: t('afternoonShort'), note: '12–17' },
              { value: 'evening', title: t('eveningShort'), note: '17–22' },
            ]}
          />
        </div>

        <button type="submit" className="srch-go" aria-busy={searching}>
          {searching ? (
            <Spinner size={16} />
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="7" cy="7" r="5" />
              <path d="m11 11 3.5 3.5" />
            </svg>
          )}
          {searching ? t('searching') : t('findCourt')}
        </button>
      </form>

      {/* ── what there is ── */}
      <section className={`srch-results${searching && !query.isLoading ? ' is-stale' : ''}`} aria-busy={searching}>
        {query.isLoading && <SkeletonRows height={92} />}

        {query.isSuccess && (
          <h2 className="srch-h2">
            {t('resultsTitle')}
            {results.length > 0 && <span>{results.length}</span>}
            <small>{shownDay}</small>
          </h2>
        )}

        {query.isSuccess && results.length === 0 && (
          <div className="srch-empty">
            <b>{t('empty')}</b>
            <span>{t('emptyHelp')}</span>
          </div>
        )}

        <div className="srch-list">
          {results.map((r) => (
            <Link
              key={r.club.id}
              href={`/clubs/${r.club.slug}`}
              onClick={closeModal}
              className={`srch-card${r.freeCount === 0 ? ' is-none' : ''}`}
            >
              <ClubThumb src={r.club.photoUrl} size={56} />
              <span className="srch-body">
                <span className="srch-name">{r.club.name}</span>
                <span className="srch-meta">
                  {[r.club.cityName, ...r.club.surfaces.map((sf) => enumLabel(te, 'Surface', sf))].join(' · ')}
                </span>
                {r.sampleTimes.length > 0 && (
                  <span className="srch-times">
                    <small>{t('earliest')}</small>
                    {r.sampleTimes.map((tm) => (
                      <span key={tm} className="mono">
                        {tm}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span className="srch-side">
                <span className={`bk-tag ${r.freeCount ? 'is-ok' : 'is-off'}`}>
                  {r.freeCount ? t('freeSlots', { count: r.freeCount }) : t('noFree')}
                </span>
                {r.fromPriceCents != null && (
                  <span className="srch-price">
                    <small>{t('from')}</small> {money(r.fromPriceCents, r.currency)}
                  </span>
                )}
              </span>
              <svg className="srch-arrow" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m7 4 5 5-5 5" />
              </svg>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

/** One-of-a-few as a row of pills: every option is in view, one tap to pick. */
function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; title: string; note?: string }[];
}) {
  return (
    <div className="srch-field" role="radiogroup" aria-label={label}>
      <span className="srch-label">{label}</span>
      <span className="srch-pills">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`srch-pill${value === o.value ? ' is-on' : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.title}
            {o.note && <small className="mono">{o.note}</small>}
          </button>
        ))}
      </span>
    </div>
  );
}
