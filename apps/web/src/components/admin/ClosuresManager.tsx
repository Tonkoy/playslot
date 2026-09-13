'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { createClubClosure, deleteClubClosure, getClubClosures } from '@/lib/api';
import { formatInstant, hhmmToMin } from '@/lib/tz';
import { DatePicker } from '../DatePicker';
import { useToast } from '../Toast';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Club-admin management of special days: holidays / downtime that close the club. */
export function ClosuresManager({ clubId, timezone }: { clubId: number; timezone: string }) {
  const t = useTranslations('Closures');
  const tt = useTranslations('Toasts');
  const locale = useLocale();
  const qc = useQueryClient();
  const toast = useToast();

  const closures = useQuery({ queryKey: ['closures', clubId], queryFn: () => getClubClosures(clubId) });

  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(todayIso());
  const [allDay, setAllDay] = useState(true);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('12:00');
  const [reason, setReason] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['closures', clubId] });
    qc.invalidateQueries({ queryKey: ['availability', clubId] });
  };

  const create = useMutation({
    mutationFn: () =>
      createClubClosure(clubId, {
        fromDate,
        toDate: allDay ? toDate : fromDate,
        allDay,
        ...(allDay ? {} : { startMin: hhmmToMin(start), endMin: hhmmToMin(end) }),
        reason: reason.trim(),
      }),
    onSuccess: () => {
      invalidate();
      setReason('');
      toast(tt('closureAdded'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  const remove = useMutation({
    mutationFn: (c: { startsAt: string; endsAt: string }) => deleteClubClosure(clubId, c),
    onSuccess: () => {
      invalidate();
      toast(tt('closureRemoved'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  const canCreate = reason.trim().length > 0 && (allDay || hhmmToMin(end) > hhmmToMin(start));

  return (
    <section style={card}>
      <h2 style={h2}>{t('title')}</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '4px 0 14px' }}>{t('help')}</p>

      {/* existing */}
      {closures.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}
      {closures.isSuccess && closures.data.length === 0 && (
        <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('none')}</p>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {closures.data?.map((c) => (
          <div key={`${c.startsAt}-${c.endsAt}`} style={row}>
            <span>
              <strong>{c.reason}</strong>
              <span className="mono" style={{ display: 'block', color: 'var(--ink-3)', fontSize: 12 }}>
                {formatInstant(c.startsAt, timezone)} – {formatInstant(c.endsAt, timezone)} · {t('courtsAffected', { n: c.courtCount })}
              </span>
            </span>
            <button type="button" onClick={() => remove.mutate({ startsAt: c.startsAt, endsAt: c.endsAt })} disabled={remove.isPending} style={delBtn}>
              {t('remove')}
            </button>
          </div>
        ))}
      </div>

      {/* add */}
      <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        <h3 style={h3}>{t('add')}</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={field}>
            {t('from')}
            <DatePicker value={fromDate} onChange={(v) => { setFromDate(v); if (toDate < v) setToDate(v); }} locale={locale} />
          </label>
          {allDay && (
            <label style={field}>
              {t('to')}
              <DatePicker value={toDate} onChange={setToDate} locale={locale} min={fromDate} />
            </label>
          )}
          {!allDay && (
            <>
              <label style={field}>
                {t('startTime')}
                <input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={input} />
              </label>
              <label style={field}>
                {t('endTime')}
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={input} />
              </label>
            </>
          )}
          <label style={{ ...field, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 46 }}>
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            {t('allDay')}
          </label>
        </div>
        <label style={{ ...field, marginTop: 10 }}>
          {t('reason')}
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('reasonPlaceholder')} style={input} />
        </label>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={!canCreate || create.isPending}
            style={{ minHeight: 44, padding: '0 20px', background: 'var(--lime)', color: 'var(--on-lime)', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 700, cursor: canCreate ? 'pointer' : 'not-allowed', opacity: canCreate ? 1 : 0.5 }}
          >
            {create.isPending ? '…' : t('add')}
          </button>
        </div>
      </div>
    </section>
  );
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 20, boxShadow: 'var(--shadow-sm)' };
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700 };
const h3: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 10 };
const row: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' };
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-2)' };
const input: React.CSSProperties = { minHeight: 46, padding: '0 10px', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit' };
const delBtn: React.CSSProperties = { minHeight: 36, padding: '0 12px', border: '1px solid var(--clay)', color: 'var(--clay)', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13 };
