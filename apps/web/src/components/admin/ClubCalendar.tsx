'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { CalendarEntry } from '@playslot/contracts';
import { Modal } from '@/components/Modal';
import { Combobox, Select } from '@/components/Picker';
import { CustomerPicker } from './CustomerPicker';
import {
  CLIENT_BASE,
  cancelReservationAsStaff,
  createBlock,
  createManualBooking,
  coachesForClub,
  getCalendar,
  markReservationNoShow,
  confirmReservation,
  markReservationPaid,
  rescheduleReservation,
} from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { hhmmToMin, localHHMM, minToHHMM, zonedIso } from '@/lib/tz';
import { SkeletonRows } from '@/components/Skeleton';

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

/**
 * Status → solid step + tint, from the same slot-state tokens the public
 * schedule uses: a booked slot is blue, awaiting payment amber, a block or
 * no-show neutral. The status text is never the only cue (the row also shows
 * the customer and a paid mark).
 */
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  LESSON: { bg: 'var(--teal-soft)', fg: 'var(--teal)' },
  GROUP: { bg: 'var(--tournament-soft)', fg: 'var(--tournament)' },
  CONFIRMED: { bg: 'var(--mine-soft)', fg: 'var(--mine)' },
  HOLD: { bg: 'var(--held-soft)', fg: 'var(--held)' },
  PENDING_APPROVAL: { bg: 'var(--held-soft)', fg: 'var(--held)' },
  PENDING_PAYMENT: { bg: 'var(--held-soft)', fg: 'var(--held)' },
  BLOCK: { bg: 'var(--booked-soft)', fg: 'var(--booked)' },
  NO_SHOW: { bg: 'var(--reserved-soft)', fg: 'var(--reserved)' },
  COMPLETED: { bg: 'var(--past-soft)', fg: 'var(--past)' },
};

/**
 * What the cell is, for colour and legend: a group training and a lesson read
 * differently from a plain court booking, and a block from both.
 */
function entryKind(e: CalendarEntry): string {
  if (e.type === 'BLOCK') return 'BLOCK';
  if (e.groupSession) return 'GROUP';
  if (e.coachName) return 'LESSON';
  return e.status;
}

type Selection =
  | { kind: 'free'; courtId: number; startMin: number }
  | { kind: 'entry'; entry: CalendarEntry }
  | null;

export function ClubCalendar({ clubId }: { clubId: number }) {
  const t = useTranslations('Calendar');
  const st = useTranslations('ReservationStatus');
  const te = useTranslations('Errors');
  const tt = useTranslations('Toasts');
  const qc = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [selection, setSelection] = useState<Selection>(null);
  const [blockMode, setBlockMode] = useState(false);
  const [moveEntry, setMoveEntry] = useState<CalendarEntry | null>(null);
  // What the chosen slot becomes. COURT/LESSON are bookings for a player;
  // BLOCK takes the slot out of sale (maintenance, a club event, anything).
  const [newKind, setNewKind] = useState<'COURT' | 'LESSON' | 'BLOCK'>('COURT');
  const [bookingStatus, setBookingStatus] = useState<'CONFIRMED' | 'PENDING_APPROVAL'>('CONFIRMED');
  const [customer, setCustomer] = useState<{ userId: number | null; name: string }>({ userId: null, name: '' });
  const [coachId, setCoachId] = useState<number | null>(null);
  const [coachText, setCoachText] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [durationMin, setDurationMin] = useState(60);

  const cal = useQuery({ queryKey: ['calendar', clubId, date], queryFn: () => getCalendar(clubId, date) });

  // Live updates: refetch the calendar when bookings change for this club.
  useEffect(() => {
    const es = new EventSource(`${CLIENT_BASE}/api/availability/stream?clubId=${clubId}`);
    es.onmessage = () => qc.invalidateQueries({ queryKey: ['calendar', clubId] });
    return () => es.close();
  }, [clubId, qc]);

  const tz = cal.data?.timezone ?? 'Europe/Sofia';
  const step = cal.data?.slotIntervalMin ?? 60;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['calendar', clubId, date] });
  // Say why it was refused — "club closed", "already taken" — rather than the
  // server's generic line (QA-09).
  const onErr = (e: unknown) => window.alert(errorMessage(e, te, tt('error')));

  const coaches = useQuery({
    queryKey: ['club-coaches', clubId],
    queryFn: () => coachesForClub(clubId),
    staleTime: 5 * 60_000,
  });

  const bookMut = useMutation({
    mutationFn: (v: { startMin: number; courtId: number }) => {
      const startsAt = zonedIso(date, v.startMin, tz);
      if (newKind === 'BLOCK') {
        return createBlock(clubId, {
          startsAt,
          durationMin,
          resourceIds: [v.courtId],
          ...(blockReason.trim() ? { reason: blockReason.trim() } : {}),
        });
      }
      return createManualBooking(clubId, {
        startsAt,
        durationMin,
        resourceIds: [v.courtId],
        type: newKind,
        status: bookingStatus,
        // A chosen account links the booking to that player; otherwise the
        // typed name stands for a walk-in with no account.
        ...(customer.userId
          ? { customerUserId: customer.userId }
          : { customer: { name: customer.name.trim() || 'Walk-in' } }),
        ...(newKind === 'LESSON' && coachId ? { coachProfileId: coachId } : {}),
      });
    },
    onSuccess: () => {
      invalidate();
      setSelection(null);
      setCustomer({ userId: null, name: '' });
      setBlockReason('');
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
  // Approving a booking the club was asked to confirm (spec §16): the player
  // gets the "confirmed" email the moment this succeeds.
  const confirmMut = useMutation({
    mutationFn: (id: number) => confirmReservation(clubId, id),
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

  /** Club closure covering this court at this minute, if any (QA-03). */
  function closureAt(courtId: number, min: number): { reason: string } | null {
    for (const c of cal.data?.closures ?? []) {
      if (!c.resourceIds.includes(courtId)) continue;
      const s = hhmmToMin(localHHMM(c.startsAt));
      const e = hhmmToMin(localHHMM(c.endsAt));
      // A window that runs to the next day's 00:00 covers the rest of this day.
      const end = e <= s ? 24 * 60 : e;
      if (min >= s && min < end) return { reason: c.reason };
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
      <div
        style={{
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          marginBottom: 14,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={labelText}>{t('date')}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" onClick={() => setDate(shiftDate(date, -1))} style={iconBtn} aria-label={t('prevDay')}>
              ‹
            </button>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayIso())} style={ctrl} aria-label={t('date')} />
            <button type="button" onClick={() => setDate(shiftDate(date, 1))} style={iconBtn} aria-label={t('nextDay')}>
              ›
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDate(todayIso())}
          style={date === todayIso() ? todayBtnActive : todayBtn}
        >
          {t('today')}
        </button>
        <label
          style={{
            display: 'inline-flex',
            gap: 8,
            alignItems: 'center',
            marginLeft: 'auto',
            fontSize: 13.5,
            fontWeight: 600,
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${blockMode ? 'var(--clay)' : 'var(--line-2)'}`,
            background: blockMode ? 'var(--clay-soft)' : 'var(--surface)',
            color: blockMode ? 'var(--clay)' : 'var(--ink-2)',
            cursor: 'pointer',
          }}
        >
          <input type="checkbox" checked={blockMode} onChange={(e) => setBlockMode(e.target.checked)} />
          ⛔ {t('blockMode')}
        </label>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, margin: '0 0 14px', fontSize: 12.5, color: 'var(--ink-2)' }}>
        {[
          { solid: 'var(--free)', label: t('legendFree') },
          { solid: 'var(--mine)', label: t('legendBooked') },
          { solid: 'var(--teal)', label: t('legendLesson') },
          { solid: 'var(--tournament)', label: t('legendGroup') },
          { solid: 'var(--held)', label: t('legendHold') },
          { solid: 'var(--booked)', label: t('legendBlocked') },
          { solid: 'var(--past)', label: t('legendClosed') },
        ].map((l) => (
          <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {/* Solid swatch: the same step the cells are barred with. */}
            <i style={{ width: 12, height: 12, borderRadius: 3, background: l.solid, display: 'inline-block' }} />
            {l.label}
          </span>
        ))}
      </div>

      {moveEntry && (
        <div role="status" style={banner}>
          {t('movePrompt', { name: moveEntry.customerName ?? t('block') })}{' '}
          <button type="button" onClick={() => setMoveEntry(null)} style={smallBtn}>
            {t('cancelMove')}
          </button>
        </div>
      )}

      {cal.isLoading && <SkeletonRows />}
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
                      const kind = entryKind(hit.entry);
                      const s = STATUS_STYLE[kind] ?? STATUS_STYLE[hit.entry.status] ?? STATUS_STYLE.CONFIRMED!;
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
                              border:
                                selection?.kind === 'entry' && selection.entry.id === hit.entry.id
                                  ? '2px solid var(--green-deep)'
                                  : '1px solid var(--line)',
                              borderLeft: `4px solid ${s.fg}`,
                              borderRadius: 'var(--radius-sm)',
                              padding: '6px 8px 6px 7px',
                              cursor: 'pointer',
                              color: 'var(--ink)',
                            }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 700 }}>
                              {hit.entry.groupSession
                                ? `⚑ ${hit.entry.groupSession.title}`
                                : hit.entry.type === 'BLOCK'
                                  ? `⛔ ${hit.entry.blockReason ?? t('block')}`
                                  : (hit.entry.customerName ?? t('booking'))}
                            </span>
                            {/* What kind of session it is — a lesson named its coach, a
                                group training its headcount (QA-03). */}
                            {hit.entry.groupSession ? (
                              <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-2)' }}>
                                {hit.entry.coachName ? `${hit.entry.coachName} · ` : ''}
                                {t('registered', {
                                  n: hit.entry.groupSession.registered,
                                  cap: hit.entry.groupSession.capacity,
                                })}
                              </span>
                            ) : (
                              hit.entry.coachName && (
                                <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-2)' }}>
                                  {t('withCoach', { name: hit.entry.coachName })}
                                </span>
                              )
                            )}
                            <span className="mono" style={{ display: 'block', fontSize: 10.5, color: s.fg, fontWeight: 700 }}>
                              {st.has(hit.entry.status) ? st(hit.entry.status) : hit.entry.status}
                              {hit.entry.type !== 'BLOCK' && (paid ? ' · ✓' : ' · •')}
                            </span>
                          </button>
                        </td>
                      );
                    }
                    // Closed by a club closure: not a free slot, and not bookable.
                    const closed = closureAt(c.id, min);
                    if (closed) {
                      return (
                        <td key={c.id} style={cell}>
                          <div
                            title={closed.reason}
                            style={{
                              minHeight: 40,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              background: 'var(--past-soft)',
                              border: '1px solid var(--line)',
                              borderLeft: '4px solid var(--past)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '4px 8px 4px 7px',
                              color: 'var(--ink-2)',
                              fontSize: 11.5,
                            }}
                          >
                            <strong style={{ fontSize: 12 }}>{t('closed')}</strong>
                            <span style={{ color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {closed.reason}
                            </span>
                          </div>
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
                            background:
                              selection?.kind === 'free' && selection.courtId === c.id && selection.startMin === min
                                ? 'var(--free-soft)'
                                : moveEntry
                                  ? 'var(--free-soft)'
                                  : 'var(--surface-2)',
                            border:
                              selection?.kind === 'free' && selection.courtId === c.id && selection.startMin === min
                                ? '2px solid var(--free)'
                                : '1px dashed var(--line-2)',
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

      {/* Booking / entry action modal */}
      <Modal
        open={selection !== null}
        onClose={() => setSelection(null)}
        title={
          selection?.kind === 'free'
            ? t('newBooking', {
                court: courts.find((c) => c.id === selection.courtId)?.name ?? '',
                time: minToHHMM(selection.startMin),
              })
            : selection?.kind === 'entry'
              ? `${selection.entry.type === 'BLOCK' ? t('block') : (selection.entry.customerName ?? t('booking'))} · ${localHHMM(selection.entry.startsAt)}–${localHHMM(selection.entry.endsAt)}`
              : undefined
        }
      >
        {selection?.kind === 'free' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <div style={fieldLabel}>
              <span>{t('entryKind')}</span>
              <Select
                id="new-kind"
                ariaLabel={t('entryKind')}
                value={newKind}
                onChange={(v) => setNewKind(v as typeof newKind)}
                options={[
                  { value: 'COURT', label: t('kindCourt') },
                  { value: 'LESSON', label: t('kindLesson') },
                  { value: 'BLOCK', label: t('kindBlock') },
                ]}
              />
            </div>
            {newKind === 'BLOCK' ? (
              <label style={fieldLabel}>
                {t('blockReason')}
                <input
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  style={ctrl}
                  placeholder={t('blockReasonPlaceholder')}
                />
              </label>
            ) : (
              <>
                <div style={{ ...fieldLabel, minWidth: 240, flex: '1 1 240px' }}>
                  <span>{t('customer')}</span>
                  <CustomerPicker clubId={clubId} value={customer} onChange={setCustomer} />
                </div>
                {newKind === 'LESSON' && (
                  <div style={{ ...fieldLabel, minWidth: 200 }}>
                    <span>{t('coach')}</span>
                    <Combobox
                      id="new-coach"
                      placeholder={t('coachSearch')}
                      emptyHint={t('noCoaches')}
                      loading={coaches.isLoading}
                      value={coachId ? String(coachId) : null}
                      text={coachText}
                      // Typed text filters the club's coaches; the list is
                      // short, so it is matched here rather than on the server.
                      options={(coaches.data ?? [])
                        .filter((c) => c.name.toLowerCase().includes(coachText.trim().toLowerCase()))
                        .map((c) => ({
                          value: String(c.coachProfileId),
                          label: c.name,
                          hint: c.clubs.map((cl) => cl.name).join(' · ') || null,
                        }))}
                      onText={(v) => {
                        setCoachText(v);
                        setCoachId(null);
                      }}
                      onPick={(o) => {
                        setCoachId(Number(o.value));
                        setCoachText(o.label);
                      }}
                    />
                  </div>
                )}
                <div style={fieldLabel}>
                  <span>{t('status')}</span>
                  <Select
                    id="new-status"
                    ariaLabel={t('status')}
                    value={bookingStatus}
                    onChange={(v) => setBookingStatus(v as typeof bookingStatus)}
                    options={[
                      { value: 'CONFIRMED', label: st('CONFIRMED') },
                      { value: 'PENDING_APPROVAL', label: st('PENDING_APPROVAL') },
                    ]}
                  />
                </div>
              </>
            )}
            <div style={fieldLabel}>
              <span>{t('duration')}</span>
              <Select
                id="new-duration"
                ariaLabel={t('duration')}
                value={String(durationMin)}
                onChange={(v) => setDurationMin(Number(v))}
                options={durations.map((d) => ({ value: String(d), label: `${d} ${t('minutes')}` }))}
              />
            </div>
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
        )}
        {selection?.kind === 'entry' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {selection.entry.status === 'PENDING_APPROVAL' && (
              <button
                type="button"
                disabled={confirmMut.isPending}
                onClick={() => confirmMut.mutate(selection.entry.id)}
                style={{ ...smallBtn, background: 'var(--lime)', color: 'var(--on-lime)', border: 'none', fontWeight: 700 }}
              >
                {confirmMut.isPending ? '…' : t('confirmBooking')}
              </button>
            )}
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
          </div>
        )}
      </Modal>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '10px 8px',
  borderBottom: '1px solid var(--line)',
  fontSize: 13,
  fontWeight: 700,
  textAlign: 'center',
  background: 'var(--green-soft)',
  color: 'var(--green-deep)',
  whiteSpace: 'nowrap',
};
const timeCell: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 12,
  color: 'var(--ink-2)',
  borderBottom: '1px solid var(--line)',
  textAlign: 'right',
  background: 'var(--green-soft)',
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
const labelText: React.CSSProperties = { fontWeight: 700, fontSize: 13, color: 'var(--ink)' };
const iconBtn: React.CSSProperties = { ...ctrl, minWidth: 40, fontSize: 18, cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--green-deep)' };
const todayBtn: React.CSSProperties = {
  minHeight: 44,
  padding: '0 18px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--green-deep)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 700,
};
const todayBtnActive: React.CSSProperties = { ...todayBtn, background: 'var(--lime)', color: 'var(--on-lime)', border: 'none', fontWeight: 800 };
const smallBtn: React.CSSProperties = {
  minHeight: 40,
  padding: '0 14px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--green-deep)',
  borderRadius: 'var(--pill)',
  cursor: 'pointer',
  fontSize: 14,
};
const banner: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--radius-sm)',
  padding: '10px 14px',
  marginBottom: 12,
};
const fieldLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--ink-2)',
  minWidth: 150,
};
