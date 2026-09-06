'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { CalendarEntry } from '@playslot/contracts';
import {
  cancelReservationAsStaff,
  createBlock,
  createManualBooking,
  getCalendar,
  markReservationNoShow,
  markReservationPaid,
  rescheduleReservation,
} from '@/lib/api';
import { hhmmToMin, localHHMM, minToHHMM, zonedIso } from '@/lib/tz';

const DAY_START = 7 * 60;
const DAY_END = 22 * 60;

function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  CONFIRMED: { bg: 'var(--teal-soft)', fg: 'var(--teal)' },
  HOLD: { bg: 'var(--held-soft)', fg: 'var(--held)' },
  PENDING_PAYMENT: { bg: 'var(--held-soft)', fg: 'var(--held)' },
  BLOCK: { bg: 'var(--booked-soft)', fg: 'var(--ink-3)' },
  NO_SHOW: { bg: 'var(--booked-soft)', fg: 'var(--ink-3)' },
  COMPLETED: { bg: 'var(--surface-2)', fg: 'var(--ink-3)' },
};

type Selection =
  | { kind: 'free'; courtId: number; startMin: number }
  | { kind: 'entry'; entry: CalendarEntry }
  | null;

export function ClubCalendar({ clubId }: { clubId: number }) {
  const t = useTranslations('Calendar');
  const qc = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [selection, setSelection] = useState<Selection>(null);
  const [blockMode, setBlockMode] = useState(false);
  const [moveEntry, setMoveEntry] = useState<CalendarEntry | null>(null);
  const [custName, setCustName] = useState('');
  const [durationMin, setDurationMin] = useState(60);

  const cal = useQuery({ queryKey: ['calendar', clubId, date], queryFn: () => getCalendar(clubId, date) });
  const tz = cal.data?.timezone ?? 'Europe/Sofia';
  const step = cal.data?.slotIntervalMin ?? 60;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['calendar', clubId, date] });
  const onErr = (e: unknown) => window.alert(e instanceof Error ? e.message : String(e));

  const bookMut = useMutation({
    mutationFn: (v: { startMin: number; courtId: number }) =>
      createManualBooking(clubId, {
        startsAt: zonedIso(date, v.startMin, tz),
        durationMin,
        resourceIds: [v.courtId],
        customer: { name: custName.trim() || 'Walk-in' },
      }),
    onSuccess: () => {
      invalidate();
      setSelection(null);
      setCustName('');
    },
    onError: onErr,
  });
  const blockMut = useMutation({
    mutationFn: (v: { startMin: number; courtId: number }) =>
      createBlock(clubId, { startsAt: zonedIso(date, v.startMin, tz), durationMin: step, resourceIds: [v.courtId] }),
    onSuccess: invalidate,
    onError: onErr,
  });
  const moveMut = useMutation({
    mutationFn: (v: { entry: CalendarEntry; courtId: number; startMin: number }) =>
      rescheduleReservation(clubId, v.entry.id, {
        startsAt: zonedIso(date, v.startMin, tz),
        durationMin: hhmmToMin(localHHMM(v.entry.endsAt)) - hhmmToMin(localHHMM(v.entry.startsAt)),
        resourceIds: [v.courtId],
      }),
    onSuccess: () => {
      invalidate();
      setMoveEntry(null);
      setSelection(null);
    },
    onError: onErr,
  });
  const cancelMut = useMutation({
    mutationFn: (id: number) => cancelReservationAsStaff(clubId, id),
    onSuccess: () => {
      invalidate();
      setSelection(null);
    },
    onError: onErr,
  });
  const paidMut = useMutation({
    mutationFn: (id: number) => markReservationPaid(clubId, id),
    onSuccess: invalidate,
    onError: onErr,
  });
  const noShowMut = useMutation({
    mutationFn: (id: number) => markReservationNoShow(clubId, id),
    onSuccess: () => {
      invalidate();
      setSelection(null);
    },
    onError: onErr,
  });

  const rows = useMemo(() => {
    const out: number[] = [];
    for (let m = DAY_START; m < DAY_END; m += step) out.push(m);
    return out;
  }, [step]);

  const courts = cal.data?.courts ?? [];

  // court -> covering entry per minute
  function entryAt(courtId: number, min: number): { entry: CalendarEntry; isStart: boolean } | null {
    for (const e of cal.data?.entries ?? []) {
      if (!e.resourceIds.includes(courtId)) continue;
      const s = hhmmToMin(localHHMM(e.startsAt));
      const en = hhmmToMin(localHHMM(e.endsAt));
      if (min >= s && min < en) return { entry: e, isStart: min === s };
    }
    return null;
  }

  function onFreeCell(courtId: number, startMin: number) {
    if (moveEntry) {
      moveMut.mutate({ entry: moveEntry, courtId, startMin });
    } else if (blockMode) {
      blockMut.mutate({ startMin, courtId });
    } else {
      setSelection({ kind: 'free', courtId, startMin });
    }
  }

  const durations = useMemo(() => {
    const base = step === 30 ? [30, 60, 90, 120] : [60, 90, 120];
    return base;
  }, [step]);

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <button type="button" onClick={() => setDate(shiftDate(date, -1))} style={navBtn} aria-label={t('prevDay')}>
          ‹
        </button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayIso())} style={ctrl} aria-label={t('date')} />
        <button type="button" onClick={() => setDate(shiftDate(date, 1))} style={navBtn} aria-label={t('nextDay')}>
          ›
        </button>
        <button type="button" onClick={() => setDate(todayIso())} style={ctrl}>
          {t('today')}
        </button>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 'auto', fontSize: 14 }}>
          <input type="checkbox" checked={blockMode} onChange={(e) => setBlockMode(e.target.checked)} />
          {t('blockMode')}
        </label>
      </div>

      {moveEntry && (
        <div role="status" style={banner}>
          {t('movePrompt', { name: moveEntry.customerName ?? t('block') })}{' '}
          <button type="button" onClick={() => setMoveEntry(null)} style={smallBtn}>
            {t('cancelMove')}
          </button>
        </div>
      )}

      {cal.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}
      {cal.isError && <div role="alert" style={{ ...banner, background: 'var(--clay-soft)', border: '1px solid var(--clay)' }}>{t('error')}</div>}

      {cal.isSuccess && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--radius)' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 90 + courts.length * 150 }}>
            <thead>
              <tr>
                <th style={{ ...th, position: 'sticky', left: 0, zIndex: 2 }}>{t('time')}</th>
                {courts.map((c) => (
                  <th key={c.id} style={th}>
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((min) => (
                <tr key={min}>
                  <th scope="row" className="mono" style={{ ...timeCell, position: 'sticky', left: 0, zIndex: 1 }}>
                    {minToHHMM(min)}
                  </th>
                  {courts.map((c) => {
                    const hit = entryAt(c.id, min);
                    if (hit) {
                      if (!hit.isStart) return <td key={c.id} style={{ ...cell, background: 'var(--surface-2)' }} aria-hidden />;
                      const s = STATUS_STYLE[hit.entry.type === 'BLOCK' ? 'BLOCK' : hit.entry.status] ?? STATUS_STYLE.CONFIRMED!;
                      const paid = hit.entry.paymentStatus === 'CAPTURED';
                      return (
                        <td key={c.id} style={cell}>
                          <button
                            type="button"
                            onClick={() => setSelection({ kind: 'entry', entry: hit.entry })}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              background: s.bg,
                              border: `1px solid ${s.fg}`,
                              borderRadius: 'var(--radius-sm)',
                              padding: '6px 8px',
                              cursor: 'pointer',
                              color: 'var(--ink)',
                            }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 700 }}>
                              {hit.entry.type === 'BLOCK' ? `⛔ ${t('block')}` : hit.entry.customerName ?? t('booking')}
                            </span>
                            <span className="mono" style={{ display: 'block', fontSize: 10.5, color: s.fg }}>
                              {hit.entry.status}
                              {hit.entry.type !== 'BLOCK' && (paid ? ' · ✓' : ' · •')}
                            </span>
                          </button>
                        </td>
                      );
                    }
                    return (
                      <td key={c.id} style={cell}>
                        <button
                          type="button"
                          onClick={() => onFreeCell(c.id, min)}
                          aria-label={t('freeCell', { court: c.name, time: minToHHMM(min) })}
                          style={{
                            width: '100%',
                            minHeight: 40,
                            background: moveEntry ? 'var(--free-soft)' : 'transparent',
                            border: '1px dashed var(--line-2)',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            color: 'var(--ink-3)',
                            fontSize: 12,
                          }}
                        >
                          {blockMode ? '⛔' : '+'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Booking form for a free cell */}
      {selection?.kind === 'free' && (
        <div style={panel}>
          <h3 style={{ fontWeight: 700, marginBottom: 10 }}>
            {t('newBooking', {
              court: courts.find((c) => c.id === selection.courtId)?.name ?? '',
              time: minToHHMM(selection.startMin),
            })}
          </h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={fieldLabel}>
              {t('customer')}
              <input value={custName} onChange={(e) => setCustName(e.target.value)} style={ctrl} placeholder="Walk-in" />
            </label>
            <label style={fieldLabel}>
              {t('duration')}
              <select value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} style={ctrl}>
                {durations.map((d) => (
                  <option key={d} value={d}>
                    {d} {t('minutes')}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={bookMut.isPending}
              onClick={() => bookMut.mutate({ startMin: selection.startMin, courtId: selection.courtId })}
              style={{ ...smallBtn, background: 'var(--lime)', color: 'var(--on-lime)', border: 'none', fontWeight: 700 }}
            >
              {t('book')}
            </button>
            <button type="button" onClick={() => setSelection(null)} style={smallBtn}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Entry action bar */}
      {selection?.kind === 'entry' && (
        <div style={panel}>
          <h3 style={{ fontWeight: 700, marginBottom: 8 }}>
            {selection.entry.type === 'BLOCK' ? t('block') : selection.entry.customerName ?? t('booking')} ·{' '}
            {localHHMM(selection.entry.startsAt)}–{localHHMM(selection.entry.endsAt)}
          </h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {selection.entry.type !== 'BLOCK' && (
              <button type="button" onClick={() => paidMut.mutate(selection.entry.id)} style={smallBtn}>
                {t('markPaid')}
              </button>
            )}
            {selection.entry.type !== 'BLOCK' && (
              <button type="button" onClick={() => noShowMut.mutate(selection.entry.id)} style={smallBtn}>
                {t('noShow')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMoveEntry(selection.entry);
                setSelection(null);
              }}
              style={smallBtn}
            >
              {t('move')}
            </button>
            <button
              type="button"
              onClick={() => cancelMut.mutate(selection.entry.id)}
              style={{ ...smallBtn, borderColor: 'var(--clay)', color: 'var(--clay)' }}
            >
              {t('cancel')}
            </button>
            <button type="button" onClick={() => setSelection(null)} style={{ ...smallBtn, marginLeft: 'auto' }}>
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '10px 8px',
  borderBottom: '1px solid var(--line)',
  fontSize: 13,
  textAlign: 'center',
  background: 'var(--surface-2)',
  whiteSpace: 'nowrap',
};
const timeCell: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 12,
  color: 'var(--ink-2)',
  borderBottom: '1px solid var(--line)',
  textAlign: 'right',
  background: 'var(--surface-2)',
  whiteSpace: 'nowrap',
};
const cell: React.CSSProperties = { padding: 3, borderBottom: '1px solid var(--line)', verticalAlign: 'top' };
const ctrl: React.CSSProperties = {
  minHeight: 44,
  padding: '0 10px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
};
const navBtn: React.CSSProperties = { ...ctrl, minWidth: 44, fontSize: 18, cursor: 'pointer' };
const smallBtn: React.CSSProperties = {
  minHeight: 40,
  padding: '0 14px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  fontSize: 14,
};
const panel: React.CSSProperties = {
  marginTop: 16,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 16,
  boxShadow: 'var(--shadow-sm)',
};
const banner: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--radius-sm)',
  padding: '10px 14px',
  marginBottom: 12,
};
const fieldLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-2)' };
