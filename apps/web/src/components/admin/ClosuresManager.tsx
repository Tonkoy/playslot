'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { createClubClosure, deleteClubClosure, getClubClosures } from '@/lib/api';
import { ApiRequestError, errorMessage } from '@/lib/errors';
import { formatDateRange, formatInstant, hhmmToMin, minToHHMM } from '@/lib/tz';
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
  const te = useTranslations('Errors');
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
  const [clashes, setClashes] = useState<{ id: number; startsAt: string; customerName: string | null }[]>([]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['closures', clubId] });
    qc.invalidateQueries({ queryKey: ['availability', clubId] });
  };

  const create = useMutation({
    // A timed closure now spans the whole range too — one window per day.
    mutationFn: () =>
      createClubClosure(clubId, {
        fromDate,
        toDate,
        allDay,
        ...(allDay ? {} : { startMin: hhmmToMin(start), endMin: hhmmToMin(end) }),
        reason: reason.trim(),
      }),
    onSuccess: () => {
      invalidate();
      setReason('');
      setClashes([]);
      toast(tt('closureAdded'));
    },
    onError: (e) => {
      // Bookings inside the window block the closure — name them (QA-04).
      const booked =
        e instanceof ApiRequestError && e.reason === 'closure_overlaps_bookings'
          ? (e.details.bookings as { id: number; startsAt: string; customerName: string | null }[] | undefined)
          : undefined;
      setClashes(booked ?? []);
      toast(errorMessage(e, te, tt('error')), 'error');
    },
  });

  const remove = useMutation({
    // Passing the reason removes exactly this closure's windows, not a
    // different closure that happens to fall inside the same range.
    mutationFn: (c: { startsAt: string; endsAt: string; reason: string }) => deleteClubClosure(clubId, c),
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
          <div key={`${c.startsAt}-${c.endsAt}-${c.reason}`} style={row}>
            <span>
              <strong>{c.reason}</strong>
              <span className="mono" style={{ display: 'block', color: 'var(--ink-3)', fontSize: 12 }}>
                {/* As entered — "27–28.10.2026 · 09:00–12:00 дневно" — never one
                    long span, which read as if the night were closed too. */}
                {formatDateRange(c.fromDate, c.toDate)} ·{' '}
                {c.allDay
                  ? t('allDayLabel')
                  : `${minToHHMM(c.startMin ?? 0)}–${minToHHMM(c.endMin ?? 0)}${
                      c.days > 1 ? ` ${t('dailyLabel')}` : ''
                    }`}{' '}
                · {t('courtsAffected', { n: c.courtCount })}
              </span>
            </span>
            <button
              type="button"
              onClick={() => remove.mutate({ startsAt: c.startsAt, endsAt: c.endsAt, reason: c.reason })}
              disabled={remove.isPending}
              style={delBtn}
            >
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
          <label style={field}>
            {t('to')}
            <DatePicker value={toDate} onChange={setToDate} locale={locale} min={fromDate} />
          </label>
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
        {clashes.length > 0 && (
          <div role="alert" style={clashBox}>
            <strong style={{ fontSize: 14 }}>{t('clashTitle')}</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--ink-2)' }}>
              {clashes.map((b) => (
                <li key={b.id}>
                  #{b.id} · {formatInstant(b.startsAt, timezone)}
                  {b.customerName ? ` · ${b.customerName}` : ''}
                </li>
              ))}
            </ul>
            <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 12, marginTop: 6 }}>{t('clashHint')}</span>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={!canCreate || create.isPending}
            style={{ minHeight: 44, padding: '0 20px', background: 'var(--lime)', color: 'var(--on-lime)', border: 'none', borderRadius: 'var(--pill)', fontWeight: 700, cursor: canCreate ? 'pointer' : 'not-allowed', opacity: canCreate ? 1 : 0.5 }}
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
const clashBox: React.CSSProperties = {
  marginTop: 12,
  border: '1px solid var(--clay)',
  background: 'var(--clay-soft)',
  borderRadius: 'var(--radius-sm)',
  padding: '10px 12px',
};
const delBtn: React.CSSProperties = { minHeight: 36, padding: '0 12px', border: '1px solid var(--clay)', color: 'var(--clay)', background: 'var(--surface)', borderRadius: 'var(--pill)', cursor: 'pointer', fontSize: 13 };
