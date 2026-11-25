'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CalendarEntry } from '@playslot/contracts';
import { DatePicker } from '@/components/DatePicker';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { Combobox, Select } from '@/components/Picker';
import { CustomerPicker } from './CustomerPicker';
import {
  STREAM_BASE,
  cancelReservationAsStaff,
  createBlock,
  createManualBooking,
  coachesForClub,
  fetchAvailabilitySummary,
  getCalendar,
  markReservationNoShow,
  confirmReservation,
  markReservationPaid,
  rescheduleReservation,
} from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { hhmmToMin, localHHMM, minToHHMM, zonedIso } from '@/lib/tz';
import { SkeletonRows } from '@/components/Skeleton';
import { BusyLabel } from '@/components/Spinner';

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

/** Days shown in the strip above the grid — the same strip the public calendar has. */
const STRIP_DAYS = 7;
/** A calendar day as a Date at UTC midnight — for formatting only, with `timeZone: 'UTC'`. */
const asUtcDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

type Band = 'bandMorning' | 'bandAfternoon' | 'bandEvening';
function bandOf(min: number): Band {
  if (min < 12 * 60) return 'bandMorning';
  return min < 17 * 60 ? 'bandAfternoon' : 'bandEvening';
}

/** The club's own "today" and minutes since its midnight — what counts as past. */
function clubNow(tz: string): { day: string; min: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((x) => x.type === type)?.value ?? '00';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, min: Number(get('hour')) * 60 + Number(get('minute')) };
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
  // Amber, not the violet of group trainings, so the two never read alike.
  TOURNAMENT: { bg: 'var(--event-soft)', fg: 'var(--event)' },
  NO_SHOW: { bg: 'var(--reserved-soft)', fg: 'var(--reserved)' },
  COMPLETED: { bg: 'var(--past-soft)', fg: 'var(--past)' },
};

/**
 * What the cell is, for colour and legend: a group training and a lesson read
 * differently from a plain court booking, and a block from both.
 */
/** Blocks and tournament blocks hold a court for the club, not for a customer. */
const isBlockLike = (e: CalendarEntry) => e.type === 'BLOCK' || e.type === 'TOURNAMENT';

function entryKind(e: CalendarEntry): string {
  if (e.type === 'BLOCK') return 'BLOCK';
  if (e.type === 'TOURNAMENT') return 'TOURNAMENT';
  if (e.groupSession) return 'GROUP';
  if (e.coachName) return 'LESSON';
  return e.status;
}

type Selection =
  | { kind: 'free'; courtId: number; startMin: number }
  | { kind: 'entry'; entry: CalendarEntry }
  | null;

export function ClubCalendar({ clubId, initialDate }: { clubId: number; initialDate?: string }) {
  const t = useTranslations('Calendar');
  const st = useTranslations('ReservationStatus');
  const te = useTranslations('Errors');
  const tt = useTranslations('Toasts');
  // Day strip, bands and the past-hours bar speak the public calendar's words.
  const tg = useTranslations('Grid');
  const locale = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  // A link can open a given day (?date=YYYY-MM-DD), e.g. from the Smile Cup list.
  const [date, setDate] = useState(
    initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : todayIso(),
  );
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
  // Today's hours that are already over fold into one bar, as on the public calendar.
  const [showPast, setShowPast] = useState(false);
  // Phone list: which hour is unfolded.
  const [openMin, setOpenMin] = useState<number | null>(null);

  const cal = useQuery({ queryKey: ['calendar', clubId, date], queryFn: () => getCalendar(clubId, date) });

  // Live updates: refetch the calendar when bookings change for this club.
  useEffect(() => {
    const es = new EventSource(`${STREAM_BASE}/api/availability/stream?clubId=${clubId}`);
    es.onmessage = () => qc.invalidateQueries({ queryKey: ['calendar', clubId] });
    return () => es.close();
  }, [clubId, qc]);

  const tz = cal.data?.timezone ?? 'Europe/Sofia';
  const step = cal.data?.slotIntervalMin ?? 60;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['calendar', clubId, date] });
  // Say why it was refused — "club closed", "already taken" — rather than the
  // server's generic line (QA-09).
  const onErr = (e: unknown) => toast(errorMessage(e, te, tt('error')), 'error');

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
  const entries = cal.data?.entries ?? [];

  // court -> covering entry per minute
  function entryAt(
    courtId: number,
    min: number,
  ): { entry: CalendarEntry; isStart: boolean; isEnd: boolean } | null {
    for (const e of entries) {
      if (!e.resourceIds.includes(courtId)) continue;
      const s = hhmmToMin(localHHMM(e.startsAt));
      const en = hhmmToMin(localHHMM(e.endsAt));
      if (min >= s && min < en) return { entry: e, isStart: min === s, isEnd: min + step >= en };
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

  // ── days ──
  const today = todayIso();
  const inThisWeek = date >= today && date <= shiftDate(today, STRIP_DAYS - 1);
  const stripStart = inThisWeek ? today : date;
  const stripDays = Array.from({ length: STRIP_DAYS }, (_, i) => shiftDate(stripStart, i));
  // Free-slot counts under the days: how full each day is, at a glance.
  // Decoration only — if it fails the strip simply shows no numbers.
  const summary = useQuery({
    queryKey: ['availabilitySummary', clubId, stripStart, step],
    queryFn: () => fetchAvailabilitySummary({ clubId, from: stripStart, days: STRIP_DAYS, duration: step }),
    retry: false,
    staleTime: 60_000,
  });
  const goToDate = (next: string) => {
    setSelection(null);
    setShowPast(false);
    setOpenMin(null);
    setDate(next);
  };
  const loc = locale === 'bg' ? 'bg-BG' : 'en-GB';
  const weekdayShort = useMemo(() => new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }), [loc]);
  const dayLong = useMemo(
    () => new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
    [loc],
  );

  // ── past hours (today only: an earlier day is shown whole, as it was) ──
  const now = clubNow(tz);
  const pastRows = date === now.day ? rows.filter((m) => m + step <= now.min) : [];
  const liveRows = rows.filter((m) => !pastRows.includes(m));
  const foldPast = pastRows.length > 0 && liveRows.length > 0;
  const isPastRow = (min: number) => foldPast && pastRows.includes(min);
  const dayOver = date < now.day;
  const pastBookings = foldPast
    ? entries.filter((e) => !isBlockLike(e) && hhmmToMin(localHHMM(e.startsAt)) < liveRows[0]!).length
    : 0;

  const kindsPresent = new Set(entries.map(entryKind));
  const hasClosures = (cal.data?.closures ?? []).length > 0;

  /** What the cell says: who or what holds the court. */
  const entryTitle = (e: CalendarEntry) =>
    e.groupSession
      ? `⚑ ${e.groupSession.title}`
      : e.type === 'TOURNAMENT'
        ? `🏆 ${e.blockReason ?? t('block')}`
        : e.type === 'BLOCK'
          ? `⛔ ${e.blockReason ?? t('block')}`
          : (e.customerName ?? t('booking'));
  /** The line under it: coach or headcount, then status and whether it is paid. */
  const entryNote = (e: CalendarEntry) => {
    const lead = e.groupSession
      ? `${e.coachName ? `${e.coachName} · ` : ''}${t('registered', { n: e.groupSession.registered, cap: e.groupSession.capacity })}`
      : e.coachName
        ? t('withCoach', { name: e.coachName })
        : null;
    const status = st.has(e.status) ? st(e.status) : e.status;
    const paid = isBlockLike(e) ? '' : e.paymentStatus === 'CAPTURED' ? ' · ✓' : ' · •';
    return lead ? `${lead} · ${status}${paid}` : `${status}${paid}`;
  };
  const toneOf = (e: CalendarEntry) => {
    const s = STATUS_STYLE[entryKind(e)] ?? STATUS_STYLE[e.status] ?? STATUS_STYLE.CONFIRMED!;
    return { '--tone': s.fg, '--tone-soft': s.bg } as React.CSSProperties;
  };
  const isSelectedEntry = (e: CalendarEntry) => selection?.kind === 'entry' && selection.entry.id === e.id;
  const isSelectedFree = (courtId: number, min: number) =>
    selection?.kind === 'free' && selection.courtId === courtId && selection.startMin === min;
  const freeMark = blockMode ? '⛔' : '+';

  /**
   * Whether row `i` opens a part of the day (and so has a band label above
   * it). With the past folded away, the first live hour does too.
   */
  const startsBand = (i: number) =>
    i === 0 || bandOf(rows[i - 1]!) !== bandOf(rows[i]!) || (foldPast && !showPast && i === pastRows.length);

  /** One cell of the desktop grid. */
  const gridCell = (c: { id: number; name: string }, min: number, i: number) => {
    const hit = entryAt(c.id, min);
    if (hit) {
      const e = hit.entry;
      // A long booking is drawn as one block down its rows — except across a
      // band label, where it ends and picks up again below with its name.
      const head = hit.isStart || startsBand(i);
      const joinsNext = !hit.isEnd && i + 1 < rows.length && !startsBand(i + 1);
      const cls = `slot acal-entry${head ? '' : ' is-cont'}${joinsNext ? ' is-open-b' : ''}${isSelectedEntry(e) ? ' is-selected' : ''}`;
      return (
        <td key={c.id}>
          <button
            type="button"
            className={cls}
            style={toneOf(e)}
            // The rest of a long booking is the same button again, for the
            // mouse only: keyboard and screen readers meet it once.
            tabIndex={hit.isStart ? undefined : -1}
            aria-hidden={hit.isStart ? undefined : true}
            title={`${entryTitle(e)} · ${localHHMM(e.startsAt)}–${localHHMM(e.endsAt)}`}
            onClick={() => setSelection({ kind: 'entry', entry: e })}
          >
            {head && (
              <>
                <b>{entryTitle(e)}</b>
                <small>{hit.isStart ? entryNote(e) : t('until', { time: localHHMM(e.endsAt) })}</small>
              </>
            )}
          </button>
        </td>
      );
    }
    // Closed by a club closure: not a free slot, and not bookable.
    const closed = closureAt(c.id, min);
    if (closed) {
      return (
        <td key={c.id}>
          <div className="slot slot-taken acal-closed" title={closed.reason}>
            {t('closed')}
          </div>
        </td>
      );
    }
    const over = dayOver || pastRows.includes(min);
    return (
      <td key={c.id}>
        <button
          type="button"
          className={`slot slot-free acal-free${over ? ' is-over' : ''}${blockMode ? ' is-block' : ''}${moveEntry ? ' is-target' : ''}${isSelectedFree(c.id, min) ? ' is-selected' : ''}`}
          aria-label={t('freeCell', { court: c.name, time: minToHHMM(min) })}
          onClick={() => onFreeCell(c.id, min)}
        >
          {freeMark}
        </button>
      </td>
    );
  };

  /** One hour in the phone list: what is free, what is booked; a tap unfolds the courts. */
  const hourRow = (min: number) => {
    const cells = courts.map((c) => ({ c, hit: entryAt(c.id, min), closed: closureAt(c.id, min) }));
    const free = cells.filter((x) => !x.hit && !x.closed).length;
    const booked = new Set(cells.filter((x) => x.hit && !isBlockLike(x.hit.entry)).map((x) => x.hit!.entry.id)).size;
    const waiting = cells.some((x) => x.hit?.entry.status === 'PENDING_APPROVAL');
    const tournament = cells.some((x) => x.hit?.entry.type === 'TOURNAMENT');
    const allClosed = cells.length > 0 && cells.every((x) => x.closed);
    const open = openMin === min;
    const time = minToHHMM(min);
    const info = (
      <>
        <span className="avail-hour-time mono">{time}</span>
        <span className="avail-hour-info">
          {allClosed
            ? t('closed')
            : free > 0
              ? tg.rich('freeCourts', { count: free, b: (x) => <b>{x}</b> })
              : tg('noneFree')}
          {booked > 0 && <span className="avail-badge">{t('bookedCount', { count: booked })}</span>}
          {waiting && <span className="avail-badge badge-event">{st('PENDING_APPROVAL')}</span>}
          {tournament && <span className="avail-badge badge-event">{t('legendTournament')}</span>}
        </span>
      </>
    );
    if (allClosed) {
      return (
        <div key={min} className="avail-hour is-full">
          <div className="avail-hour-top">{info}</div>
        </div>
      );
    }
    // Only what needs the club's answer marks the whole row.
    const tone = waiting ? ' tone-event' : '';
    return (
      <div key={min} className={`avail-hour${open ? ' is-open' : ''}${tone}`}>
        <button type="button" className="avail-hour-top" aria-expanded={open} onClick={() => setOpenMin(open ? null : min)}>
          {info}
          <span className="avail-hour-chev" aria-hidden>
            ›
          </span>
        </button>
        {/* Always rendered so it can slide open and shut; `inert` keeps the
            folded tiles out of the tab order and screen readers. */}
        <div className={`avail-fold${open ? ' is-open' : ''}`} inert={!open}>
          <div className="avail-fold-inner">
            <div className="avail-courts">
              {cells.map(({ c, hit, closed }, i) => {
                const stagger = { '--i': i } as React.CSSProperties;
                if (hit) {
                  const e = hit.entry;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`avail-court acal-tile${isSelectedEntry(e) ? ' is-selected' : ''}`}
                      style={{ ...stagger, ...toneOf(e) }}
                      onClick={() => setSelection({ kind: 'entry', entry: e })}
                    >
                      <span>
                        {c.name} · {entryTitle(e)}
                        <small>
                          {localHHMM(e.startsAt)}–{localHHMM(e.endsAt)} · {entryNote(e)}
                        </small>
                      </span>
                    </button>
                  );
                }
                if (closed) {
                  return (
                    <div key={c.id} className="avail-court slot-taken" style={stagger}>
                      <span>
                        {c.name}
                        <small>
                          {t('closed')} · {closed.reason}
                        </small>
                      </span>
                    </div>
                  );
                }
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`avail-court slot-free${isSelectedFree(c.id, min) ? ' is-selected' : ''}`}
                    style={stagger}
                    aria-label={t('freeCell', { court: c.name, time })}
                    onClick={() => onFreeCell(c.id, min)}
                  >
                    <span>
                      {c.name}
                      <small>{t('legendFree')}</small>
                    </span>
                    <span>{freeMark}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // The whole bar is the toggle; the hours it hides slide open below it.
  const pastFold = foldPast && (
    <button
      type="button"
      className={`avail-past${showPast ? ' is-open' : ''}`}
      onClick={() => setShowPast((v) => !v)}
      aria-expanded={showPast}
    >
      <span>
        {tg('pastHours', { from: minToHHMM(pastRows[0]!), to: minToHHMM(pastRows[pastRows.length - 1]! + step) })}
        {pastBookings > 0 && <> · {t('bookedCount', { count: pastBookings })}</>}
      </span>
      <span className="avail-past-action">
        {showPast ? tg('hidePast') : tg('showPast')}
        <span className="avail-past-chev" aria-hidden>
          ›
        </span>
      </span>
    </button>
  );

  const LEGEND: { kind: string; label: string }[] = [
    { kind: 'CONFIRMED', label: t('legendBooked') },
    { kind: 'LESSON', label: t('legendLesson') },
    { kind: 'GROUP', label: t('legendGroup') },
    { kind: 'TOURNAMENT', label: t('legendTournament') },
    { kind: 'PENDING_APPROVAL', label: st('PENDING_APPROVAL') },
    { kind: 'HOLD', label: t('legendHold') },
    { kind: 'PENDING_PAYMENT', label: st('PENDING_PAYMENT') },
    { kind: 'BLOCK', label: t('legendBlocked') },
  ];

  return (
    <div>
      {/* Only what occurs on this day; hidden on a phone, where the list says it in words. */}
      {cal.isSuccess && (
        <div className="avail-legend">
          <span>
            <i className="avail-swatch" style={{ background: 'var(--green-soft-2)' }} />
            {t('legendFree')}
          </span>
          {LEGEND.filter((l) => kindsPresent.has(l.kind)).map((l) => (
            <span key={l.kind}>
              <i
                className="avail-swatch"
                style={{ background: STATUS_STYLE[l.kind]!.bg, border: `1.5px solid ${STATUS_STYLE[l.kind]!.fg}` }}
              />
              {l.label}
            </span>
          ))}
          {hasClosures && (
            <span>
              <i className="avail-swatch slot-taken" />
              {t('legendClosed')}
            </span>
          )}
        </div>
      )}

      {/* Day strip, calendar for any other date, block mode. */}
      <div className="avail-bar">
        <div className="avail-days" role="group" aria-label={tg('days')}>
          <button type="button" className="avail-day acal-step" onClick={() => goToDate(shiftDate(date, -1))} aria-label={t('prevDay')}>
            ‹
          </button>
          {!inThisWeek && (
            <button type="button" className="avail-day" onClick={() => goToDate(today)}>
              <small>&nbsp;</small>
              <b style={{ fontSize: 14 }}>{t('today')}</b>
              <em />
            </button>
          )}
          {stripDays.map((day) => {
            const free = summary.data?.days.find((d) => d.date === day)?.free ?? null;
            return (
              <button
                key={day}
                type="button"
                className={`avail-day${day === date ? ' is-on' : ''}`}
                aria-pressed={day === date}
                onClick={() => goToDate(day)}
              >
                <small>{day === today ? tg('todayShort') : weekdayShort.format(asUtcDate(day))}</small>
                <b>{Number(day.slice(8, 10))}</b>
                <em className={free === 0 ? 'is-none' : undefined}>{free == null ? '' : tg('freeShort', { count: free })}</em>
              </button>
            );
          })}
          <button type="button" className="avail-day acal-step" onClick={() => goToDate(shiftDate(date, 1))} aria-label={t('nextDay')}>
            ›
          </button>
          {/* Staff look back as well as ahead: no earliest date. */}
          <DatePicker value={date} onChange={(v) => goToDate(v || today)} locale={locale} min="2000-01-01" compact label={tg('otherDate')} />
        </div>

        <button
          type="button"
          className={`acal-block${blockMode ? ' is-on' : ''}`}
          aria-pressed={blockMode}
          onClick={() => setBlockMode((v) => !v)}
        >
          ⛔ {t('blockMode')}
        </button>
      </div>

      <p className="acal-day mono">{dayLong.format(asUtcDate(date))}</p>

      {blockMode && !moveEntry && (
        <div role="status" className="acal-banner is-block">
          {t('blockPrompt')}
        </div>
      )}
      {moveEntry && (
        <div role="status" className="acal-banner">
          <span>{t('movePrompt', { name: moveEntry.customerName ?? t('block') })}</span>
          <button type="button" onClick={() => setMoveEntry(null)} style={smallBtn}>
            {t('cancelMove')}
          </button>
        </div>
      )}

      {cal.isLoading && <SkeletonRows />}
      {cal.isError && (
        <div role="alert" className="acal-banner" style={{ background: 'var(--clay-soft)', borderColor: 'var(--clay)' }}>
          {t('error')}
        </div>
      )}

      {/* Desktop: hours down, courts across. */}
      {cal.isSuccess && (
        <div className="avail-table-wrap">
          <table className="avail-table acal-table" style={{ minWidth: 64 + courts.length * 124 }}>
            <colgroup>
              <col style={{ width: 64 }} />
              {courts.map((c) => (
                <col key={c.id} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="avail-time" style={{ background: 'var(--surface-2)' }}>
                  <span className="avail-sr">{t('time')}</span>
                </th>
                {courts.map((c) => (
                  <th key={c.id} scope="col">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pastFold && (
                <tr>
                  <td colSpan={courts.length + 1} style={{ padding: '8px 8px 2px' }}>
                    {pastFold}
                  </td>
                </tr>
              )}
              {rows.map((min, i) => {
                const band = bandOf(min);
                const past = isPastRow(min);
                const collapsed = past && !showPast;
                const newBand = startsBand(i);
                const foldClass = past ? `avail-row-fold${collapsed ? ' is-collapsed' : ''}` : undefined;
                return (
                  <Fragment key={min}>
                    {newBand && (
                      <tr className={foldClass} inert={collapsed}>
                        <th colSpan={courts.length + 1} className="avail-band" scope="colgroup">
                          <div className="avail-clip">{tg(band)}</div>
                        </th>
                      </tr>
                    )}
                    <tr className={foldClass} inert={collapsed}>
                      <th scope="row" className="avail-time mono">
                        <div className="avail-clip avail-clip-time">{minToHHMM(min)}</div>
                      </th>
                      {courts.map((c) => gridCell(c, min, i))}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Phone: one row per hour; tapping an hour unfolds its courts. */}
      {cal.isSuccess && (
        <div className="avail-list">
          {pastFold && <div style={{ marginBottom: 8 }}>{pastFold}</div>}
          {foldPast && (
            <div className={`avail-fold${showPast ? ' is-open' : ''}`} inert={!showPast}>
              <div className="avail-fold-inner">{pastRows.map((min) => hourRow(min))}</div>
            </div>
          )}
          {(foldPast ? liveRows : rows).map((min) => hourRow(min))}
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
              ? `${isBlockLike(selection.entry) ? (selection.entry.blockReason ?? t('block')) : (selection.entry.customerName ?? t('booking'))} · ${localHHMM(selection.entry.startsAt)}–${localHHMM(selection.entry.endsAt)}`
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
          <p className="mono" style={{ color: 'var(--ink-2)', fontSize: 13, marginBottom: 12 }}>
            {courts
              .filter((c) => selection.entry.resourceIds.includes(c.id))
              .map((c) => c.name)
              .join(' + ')}
            {' · '}
            {entryNote(selection.entry)}
          </p>
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
                <BusyLabel busy={confirmMut.isPending}>{t('confirmBooking')}</BusyLabel>
              </button>
            )}
            {!isBlockLike(selection.entry) && (
              <button type="button" onClick={() => paidMut.mutate(selection.entry.id)} style={smallBtn}>
                {t('markPaid')}
              </button>
            )}
            {!isBlockLike(selection.entry) && (
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

const ctrl: React.CSSProperties = {
  minHeight: 44,
  padding: '0 10px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
};
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
const fieldLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--ink-2)',
  minWidth: 150,
};
