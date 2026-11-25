'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { AvailabilityCourt, AvailabilitySlot } from '@playslot/contracts';
import { DatePicker } from '@/components/DatePicker';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { Link, usePathname } from '@/i18n/navigation';
import {
  STREAM_BASE,
  coachesForClub,
  createReservation,
  fetchAvailability,
  fetchAvailabilitySummary,
  getMe,
} from '@/lib/api';
import { enumLabel } from '@/lib/enums';
import { errorMessage } from '@/lib/errors';
import { SLOT_STYLE } from '@/lib/slotStates';
import { AddToCalendar } from '@/components/AddToCalendar';
import { BusyLabel } from '@/components/Spinner';
import { CoachPicker } from './CoachPicker';
import { useMounted } from '@/lib/useMounted';

/** Days shown in the strip above the grid. */
const STRIP_DAYS = 7;

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

/** A calendar day as a Date at UTC midnight — for formatting only, with `timeZone: 'UTC'`. */
const asUtcDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** HH:mm from an ISO string carrying the club offset (local wall-clock time). */
const hhmm = (iso: string) => iso.slice(11, 16);

/** "18:00" + 90 → "19:30". */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h! * 60 + m! + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

type Band = 'bandMorning' | 'bandAfternoon' | 'bandEvening';
function bandOf(time: string): Band {
  const hour = Number(time.slice(0, 2));
  if (hour < 12) return 'bandMorning';
  return hour < 17 ? 'bandAfternoon' : 'bandEvening';
}

interface SelectedSlot {
  resourceId: number;
  start: string;
  courtName: string;
  priceCents: number | null;
  time: string;
  coachIds: number[];
}

export function AvailabilityGrid({
  clubId,
  clubName,
  initialDate,
}: {
  clubId: number;
  clubName?: string;
  initialDate?: string;
}) {
  const t = useTranslations('Grid');
  const st = useTranslations('SlotStates');
  const bk = useTranslations('Booking');
  const tt = useTranslations('Toasts');
  const te = useTranslations('Errors');
  const en = useTranslations('Enums');
  const toast = useToast();
  const locale = useLocale();
  // Drawn around today, which only the browser knows for sure.
  const mounted = useMounted();
  const pathname = usePathname();
  const qc = useQueryClient();
  const [date, setDate] = useState(
    initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : todayIso(),
  );
  const [duration, setDuration] = useState(60);
  const [selected, setSelected] = useState<SelectedSlot | null>(null);
  // Picking a slot only selects it (the bar at the bottom shows what was
  // picked); the checkout dialog opens from that bar.
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmedRef, setConfirmedRef] = useState<number | null>(null);
  // What was just booked, for "Добави в календара" in the confirmation.
  const [booked, setBooked] = useState<{ start: string; end: string; courtName: string } | null>(null);
  const [coachId, setCoachId] = useState<number | null>(null);
  const [serviceId, setServiceId] = useState<number | null>(null);
  // Online payments are not live yet: clicking «pay online» only explains that.
  const [onlinePayNotice, setOnlinePayNotice] = useState(false);
  // Hours already gone are folded into one line until asked for.
  const [showPast, setShowPast] = useState(false);
  // Phone list: the hour whose courts are unfolded.
  const [openTime, setOpenTime] = useState<string | null>(null);

  const coaches = useQuery({
    queryKey: ['clubCoaches', clubId],
    queryFn: () => coachesForClub(clubId),
  });
  const selectableCoaches = (coaches.data ?? []).filter((c) =>
    (selected?.coachIds ?? []).includes(c.coachProfileId),
  );
  const chosenCoach = selectableCoaches.find((c) => c.coachProfileId === coachId) ?? null;
  const chosenService = chosenCoach?.services.find((s) => s.id === serviceId) ?? null;

  const query = useQuery({
    queryKey: ['availability', clubId, date, duration],
    queryFn: () => fetchAvailability({ clubId, date, duration }),
  });

  // The strip shows the week from today; a date picked outside it (calendar,
  // or a link to a specific day) starts the strip at that date instead.
  const today = todayIso();
  const inThisWeek = date >= today && date <= shiftDate(today, STRIP_DAYS - 1);
  const stripStart = inThisWeek ? today : date;
  const stripDays = Array.from({ length: STRIP_DAYS }, (_, i) => shiftDate(stripStart, i));

  // Free-slot counts under the days. Decoration: if it fails (or the API is
  // older than this page) the strip simply shows no numbers.
  const summary = useQuery({
    queryKey: ['availabilitySummary', clubId, stripStart, duration],
    queryFn: () => fetchAvailabilitySummary({ clubId, from: stripStart, days: STRIP_DAYS, duration }),
    retry: false,
    staleTime: 60_000,
  });

  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });

  const clearSelection = () => {
    setSelected(null);
    setCheckoutOpen(false);
    setCoachId(null);
    setServiceId(null);
  };

  // A different day or length is a different set of slots: nothing picked on
  // the old one can carry over.
  const goToDate = (next: string) => {
    clearSelection();
    setShowPast(false);
    setOpenTime(null);
    setDate(next);
  };
  const changeDuration = (next: number) => {
    clearSelection();
    setDuration(next);
  };

  // If the club doesn't offer the currently selected length (first load, or the
  // club changed its settings), snap to the shortest one it does offer.
  useEffect(() => {
    const offered = query.data?.bookingDurationsMin;
    const shortest = offered?.[0];
    if (shortest === undefined || offered!.includes(duration)) return;
    setSelected(null);
    setCheckoutOpen(false);
    setDuration(shortest);
  }, [query.data?.bookingDurationsMin, duration]);

  // Drop the online-payment notice whenever another slot is picked.
  useEffect(() => {
    setOnlinePayNotice(false);
  }, [selected]);

  // Live updates (spec §20): refetch when another viewer books/cancels here.
  useEffect(() => {
    const es = new EventSource(`${STREAM_BASE}/api/availability/stream?clubId=${clubId}`);
    es.onmessage = () => qc.invalidateQueries({ queryKey: ['availability', clubId] });
    return () => es.close();
  }, [clubId, qc]);

  const book = useMutation({
    mutationFn: (paymentMethod: string) =>
      createReservation({
        clubId,
        type: chosenCoach ? 'LESSON' : 'COURT',
        startsAt: selected!.start,
        durationMin: duration,
        paymentMethod,
        resourceIds: [selected!.resourceId],
        ...(chosenCoach ? { coachProfileId: chosenCoach.coachProfileId } : {}),
        ...(chosenService ? { serviceId: chosenService.id } : {}),
      }),
    onSuccess: (res) => {
      // Online payment → redirect to the hosted Stripe checkout.
      if (res.next?.action === 'PAY' && res.next.checkoutUrl) {
        window.location.href = res.next.checkoutUrl;
        return;
      }
      setConfirmedRef(res.reservationId);
      if (selected) {
        setBooked({
          start: selected.start,
          end: new Date(new Date(selected.start).getTime() + duration * 60_000).toISOString(),
          courtName: selected.courtName,
        });
      }
      clearSelection();
      qc.invalidateQueries({ queryKey: ['availability', clubId] });
      qc.invalidateQueries({ queryKey: ['availabilitySummary', clubId] });
      toast(tt('booked'));
    },
    onError: (e) => toast(errorMessage(e, te, tt('error')), 'error'),
  });

  const loc = locale === 'bg' ? 'bg-BG' : 'en-GB';
  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', {
        style: 'currency',
        currency: query.data?.currency ?? 'EUR',
        maximumFractionDigits: 0,
      }),
    [locale, query.data?.currency],
  );
  const price = (cents: number | null) => (cents == null ? null : money.format(cents / 100));
  const weekdayShort = useMemo(() => new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }), [loc]);
  const dayLong = useMemo(
    () => new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
    [loc],
  );

  const courts = query.data?.courts ?? [];

  // The time-row × court-column matrix, and which rows are entirely in the past.
  const { byKey, pastTimes, liveTimes, freeToday, present } = useMemo(() => {
    const slots = query.data?.slots ?? [];
    const times = [...new Set(slots.map((s) => hhmm(s.start)))].sort();
    const map = new Map<string, AvailabilitySlot>();
    const statesAt = new Map<string, Set<string>>();
    for (const s of slots) {
      const time = hhmm(s.start);
      map.set(`${s.resourceId}@${time}`, s);
      if (!statesAt.has(time)) statesAt.set(time, new Set());
      statesAt.get(time)!.add(s.state);
    }
    const isPast = (time: string) => {
      const states = statesAt.get(time)!;
      return states.size === 1 && states.has('PAST');
    };
    return {
      byKey: map,
      pastTimes: times.filter(isPast),
      liveTimes: times.filter((x) => !isPast(x)),
      freeToday: slots.filter((s) => s.state === 'FREE').length,
      present: new Set(slots.map((s) => s.state)),
    };
  }, [query.data]);

  // A day that is entirely over has nothing to fold away: show it as it was.
  const foldPast = pastTimes.length > 0 && liveTimes.length > 0;
  const shownTimes = foldPast && !showPast ? liveTimes : [...pastTimes, ...liveTimes];
  const hasRows = pastTimes.length + liveTimes.length > 0;

  // Booking-length options adapt to the club's slot time (30 → allow 30-min).
  // The club decides which booking lengths it offers (set with its scheduling
  // and working hours); players pick from exactly that list and nothing else.
  const durations = query.data?.bookingDurationsMin?.length
    ? query.data.bookingDurationsMin
    : [query.data?.slotIntervalMin ?? 60];

  const freeCount = (day: string): number | null => {
    if (day === date && query.data) return freeToday;
    return summary.data?.days.find((d) => d.date === day)?.free ?? null;
  };

  const courtNote = (c: AvailabilityCourt) =>
    [enumLabel(en, 'Surface', c.surface), c.isIndoor ? t('indoor') : t('outdoor')].filter(Boolean).join(' · ');

  /** Cheapest free court at an hour — the list's "from" price and the grid's baseline. */
  const cheapestAt = (time: string): number | null => {
    const prices = courts
      .map((c) => byKey.get(`${c.id}@${time}`))
      .filter((s): s is AvailabilitySlot => !!s && s.state === 'FREE' && s.priceCents != null)
      .map((s) => s.priceCents!);
    return prices.length ? Math.min(...prices) : null;
  };

  const pick = (c: AvailabilityCourt, slot: AvailabilitySlot, time: string) => {
    setCoachId(null);
    setServiceId(null);
    setCheckoutOpen(false);
    setSelected({
      resourceId: c.id,
      start: slot.start,
      courtName: c.name,
      priceCents: slot.priceCents,
      time,
      coachIds: slot.coachIds ?? [],
    });
  };
  const isPicked = (c: AvailabilityCourt, slot: AvailabilitySlot) =>
    selected?.resourceId === c.id && selected?.start === slot.start;

  /** One cell of the desktop grid. */
  const gridCell = (c: AvailabilityCourt, time: string, cheapest: number | null) => {
    const slot = byKey.get(`${c.id}@${time}`);
    if (!slot) return <td key={c.id} aria-hidden />;
    const label = st(slot.state);
    if (SLOT_STYLE[slot.state].bookable) {
      const picked = isPicked(c, slot);
      const dearer = cheapest != null && slot.priceCents != null && slot.priceCents > cheapest;
      return (
        <td key={c.id}>
          <button
            type="button"
            className={`slot slot-free${dearer ? ' is-hi' : ''}${picked ? ' is-selected' : ''}`}
            aria-pressed={picked}
            title={bk('bookThisSlot')}
            onClick={() => pick(c, slot, time)}
          >
            <span className="avail-sr">
              {c.name}, {time}, {label}{' '}
            </span>
            {picked ? '✓ ' : ''}
            {price(slot.priceCents) ?? '✓'}
          </button>
        </td>
      );
    }
    const kind =
      slot.state === 'MINE'
        ? 'slot-mine'
        : slot.state === 'EVENT'
          ? 'slot-event'
          : slot.state === 'TOURNAMENT'
            ? 'slot-tournament'
            : slot.state === 'PAST'
              ? 'slot-past'
              : 'slot-taken';
    // Taken and past cells carry no visible words — the hatch says it and the
    // legend names it — but the label is still there for screen readers.
    const visible = slot.state === 'MINE' ? t('mine') : slot.state === 'EVENT' || slot.state === 'TOURNAMENT' ? label : null;
    return (
      <td key={c.id}>
        <div className={`slot ${kind}`} title={label}>
          {visible ?? <span className="avail-sr">{label}</span>}
        </div>
      </td>
    );
  };

  /** One hour in the phone list. */
  const hourRow = (time: string) => {
            const cells = courts
              .map((c) => ({ c, slot: byKey.get(`${c.id}@${time}`) }))
              .filter((x): x is { c: AvailabilityCourt; slot: AvailabilitySlot } => !!x.slot);
            const free = cells.filter((x) => SLOT_STYLE[x.slot.state].bookable).length;
            const mine = cells.some((x) => x.slot.state === 'MINE');
            const tournament = cells.some((x) => x.slot.state === 'TOURNAMENT');
            const event = cells.some((x) => x.slot.state === 'EVENT');
            const special = tournament || event;
            // The row's border takes the colour of what is special about the
            // hour, so it stands out in the list, not just a small label.
            const tone = mine ? ' tone-mine' : tournament ? ' tone-tournament' : event ? ' tone-event' : '';
            const past = cells.every((x) => x.slot.state === 'PAST');
            const cheapest = cheapestAt(time);
            const open = openTime === time;
            const info = (
              <>
                <span className="avail-hour-time mono">{time}</span>
                <span className="avail-hour-info">
                  {past ? st('PAST') : free > 0 ? t.rich('freeCourts', { count: free, b: (c) => <b>{c}</b> }) : t('noneFree')}
                  {mine && <span className="avail-badge">{t('mine')}</span>}
                  {tournament && <span className="avail-badge badge-tournament">{st('TOURNAMENT')}</span>}
                  {event && <span className="avail-badge badge-event">{st('EVENT')}</span>}
                </span>
              </>
            );
            if (free === 0 && !mine && !special) {
              return (
                <div key={time} className="avail-hour is-full">
                  <div className="avail-hour-top">{info}</div>
                </div>
              );
            }
            return (
              <div key={time} className={`avail-hour${open ? ' is-open' : ''}${free === 0 ? ' is-full' : ''}${tone}`}>
                <button
                  type="button"
                  className="avail-hour-top"
                  aria-expanded={open}
                  onClick={() => setOpenTime(open ? null : time)}
                >
                  {info}
                  {cheapest != null && <span className="avail-hour-from">{t('fromPrice', { price: price(cheapest)! })}</span>}
                  <span className="avail-hour-chev" aria-hidden>
                    ›
                  </span>
                </button>
                {/* Always rendered so it can slide open and shut; `inert` keeps
                    the folded tiles out of the tab order and screen readers. */}
                <div className={`avail-fold${open ? ' is-open' : ''}`} inert={!open}>
                  <div className="avail-fold-inner">
                    <div className="avail-courts">
                      {cells.map(({ c, slot }, i) => {
                        // Tiles follow one another in when the hour opens.
                        const stagger = { '--i': i } as React.CSSProperties;
                        if (SLOT_STYLE[slot.state].bookable) {
                          const picked = isPicked(c, slot);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              className={`avail-court slot-free${picked ? ' is-selected' : ''}`}
                              style={stagger}
                              aria-pressed={picked}
                              onClick={() => pick(c, slot, time)}
                            >
                              <span>
                                {c.name}
                                <small>{courtNote(c)}</small>
                              </span>
                              <span>{price(slot.priceCents) ?? '✓'}</span>
                            </button>
                          );
                        }
                        const kind =
                          slot.state === 'MINE'
                            ? 'slot-mine'
                            : slot.state === 'EVENT'
                              ? 'slot-event'
                              : slot.state === 'TOURNAMENT'
                                ? 'slot-tournament'
                                : 'slot-taken';
                        const note =
                          slot.state === 'MINE'
                            ? t('mine')
                            : slot.state === 'RESERVED' || slot.state === 'UNAVAILABLE'
                              ? t('taken')
                              : st(slot.state);
                        return (
                          <div key={c.id} className={`avail-court ${kind}`} style={stagger}>
                            <span>
                              {c.name}
                              <small>{note}</small>
                            </span>
                          </div>
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
      <span>{t('pastHours', { from: pastTimes[0]!, to: pastTimes[pastTimes.length - 1]! })}</span>
      <span className="avail-past-action">
        {showPast ? t('hidePast') : t('showPast')}
        <span className="avail-past-chev" aria-hidden>
          ›
        </span>
      </span>
    </button>
  );
  const isPastTime = (time: string) => foldPast && pastTimes.includes(time);
  // Past rows are always in the page when folded away, so they can animate
  // open and shut; `inert` keeps them out of reach while hidden.
  const rowTimes = foldPast ? [...pastTimes, ...liveTimes] : shownTimes;

  if (!mounted) return <GridSkeleton />;

  return (
    <section aria-labelledby="grid-heading" style={{ marginTop: 8, paddingBottom: selected ? 84 : 0 }}>
      {/* Only the states that occur on this day; hidden on a phone, where the
          list spells every state out in words. */}
      {query.isSuccess && hasRows && (
        <div className="avail-legend">
          <span>
            <i className="avail-swatch" style={{ background: 'var(--green-soft-2)' }} />
            {t('legendFree')}
          </span>
          {(present.has('RESERVED') || present.has('UNAVAILABLE')) && (
            <span>
              <i className="avail-swatch slot-taken" />
              {st('RESERVED')}
            </span>
          )}
          {present.has('MINE') && (
            <span>
              <i className="avail-swatch" style={{ background: 'var(--mine)' }} />
              {t('mine')}
            </span>
          )}
          {present.has('EVENT') && (
            <span>
              <i className="avail-swatch slot-event" style={{ border: '1px solid' }} />
              {st('EVENT')}
            </span>
          )}
          {present.has('TOURNAMENT') && (
            <span>
              <i className="avail-swatch slot-tournament" style={{ border: '1px solid' }} />
              {st('TOURNAMENT')}
            </span>
          )}
        </div>
      )}

      {/* Day strip, calendar for any other date, booking length. */}
      <div className="avail-bar">
        <div className="avail-days" role="group" aria-label={t('days')}>
          {!inThisWeek && (
            <button type="button" className="avail-day" onClick={() => goToDate(today)}>
              <small>&nbsp;</small>
              <b style={{ fontSize: 14 }}>{t('today')}</b>
              <em />
            </button>
          )}
          {stripDays.map((day) => {
            const free = freeCount(day);
            return (
              <button
                key={day}
                type="button"
                className={`avail-day${day === date ? ' is-on' : ''}`}
                aria-pressed={day === date}
                onClick={() => goToDate(day)}
              >
                <small>{day === today ? t('todayShort') : weekdayShort.format(asUtcDate(day))}</small>
                <b>{Number(day.slice(8, 10))}</b>
                <em className={free === 0 ? 'is-none' : undefined}>{free == null ? '' : t('freeShort', { count: free })}</em>
              </button>
            );
          })}
          <DatePicker value={date} onChange={(v) => goToDate(v || today)} locale={locale} compact label={t('otherDate')} />
        </div>

        {durations.length > 1 && (
          <div className="avail-seg" role="group" aria-label={t('duration')}>
            {durations.map((d) => (
              <button
                key={d}
                type="button"
                className={d === duration ? 'is-on' : undefined}
                aria-pressed={d === duration}
                onClick={() => changeDuration(d)}
              >
                {d} {t('minutes')}
              </button>
            ))}
          </div>
        )}
      </div>

      <h2 id="grid-heading" className="avail-sr">
        {t('heading')}
      </h2>

      {/* States */}
      {query.isLoading && <GridSkeleton />}
      {query.isError && (
        <div role="alert" style={alertBox}>
          {t('error')}{' '}
          <button type="button" onClick={() => query.refetch()} style={retryBtn}>
            {t('retry')}
          </button>
        </div>
      )}

      {query.isSuccess && courts.length === 0 && <div style={emptyBox}>{t('noCourts')}</div>}

      {query.isSuccess && courts.length > 0 && !hasRows && <div style={emptyBox}>{t('noSlots')}</div>}

      {/* Desktop: hours down, courts across. */}
      {query.isSuccess && hasRows && (
        <div className="avail-table-wrap">
          <table className="avail-table" style={{ minWidth: 72 + courts.length * 92 }}>
            <thead>
              <tr>
                <th className="avail-time" style={{ background: 'var(--surface-2)' }}>
                  <span className="avail-sr">{t('time')}</span>
                </th>
                {courts.map((c) => (
                  <th key={c.id} scope="col">
                    {c.name}
                    <small>{courtNote(c)}</small>
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
              {rowTimes.map((time, i) => {
                const band = bandOf(time);
                const past = isPastTime(time);
                const collapsed = past && !showPast;
                const firstLive = foldPast && !past && i === pastTimes.length;
                // With the past folded away, the first live hour starts its band.
                const newBand = i === 0 || bandOf(rowTimes[i - 1]!) !== band || (firstLive && !showPast);
                const cheapest = cheapestAt(time);
                const foldClass = past ? `avail-row-fold${collapsed ? ' is-collapsed' : ''}` : undefined;
                return (
                  <Fragment key={time}>
                    {newBand && (
                      <tr className={foldClass} inert={collapsed}>
                        <th colSpan={courts.length + 1} className="avail-band" scope="colgroup">
                          <div className="avail-clip">{t(band)}</div>
                        </th>
                      </tr>
                    )}
                    <tr className={foldClass} inert={collapsed}>
                      <th scope="row" className="avail-time mono">
                        <div className="avail-clip avail-clip-time">{time}</div>
                      </th>
                      {courts.map((c) => gridCell(c, time, cheapest))}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Phone: one row per hour — how many courts are free and from what
          price; tapping an hour unfolds its courts. No sideways scrolling. */}
      {query.isSuccess && hasRows && (
        <div className="avail-list">
          {pastFold && <div style={{ marginBottom: 8 }}>{pastFold}</div>}
          {foldPast && (
            <div className={`avail-fold${showPast ? ' is-open' : ''}`} inert={!showPast}>
              <div className="avail-fold-inner">{pastTimes.map((time) => hourRow(time))}</div>
            </div>
          )}
          {(foldPast ? liveTimes : shownTimes).map((time) => hourRow(time))}
        </div>
      )}

      {/* What was picked, always in reach; the checkout opens from here. */}
      {selected && !checkoutOpen && confirmedRef === null && (
        <div className="avail-bookbar" role="region" aria-label={bk('title')}>
          <div>
            <div style={{ minWidth: 0 }}>
              <b>
                {selected.courtName} · {selected.time}–{addMinutes(selected.time, duration)}
              </b>
              <small>
                {dayLong.format(asUtcDate(date))} · {duration} {t('minutes')}
                {selected.priceCents != null ? ` · ${price(selected.priceCents)}` : ''}
              </small>
            </div>
            <div className="avail-bookbar-actions">
              <button type="button" className="avail-clear" onClick={clearSelection} aria-label={t('clearSelection')} title={t('clearSelection')}>
                ×
              </button>
              <button type="button" className="avail-book" onClick={() => setCheckoutOpen(true)}>
                {t('book')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      <Modal open={confirmedRef !== null} onClose={() => setConfirmedRef(null)} title={bk('confirmedTitle')}>
        <p style={{ color: 'var(--ink-2)' }}>{bk('confirmedBody', { ref: confirmedRef ?? 0 })}</p>
        {confirmedRef !== null && booked && (
          <div style={{ marginTop: 14 }}>
            <AddToCalendar
              reservationId={confirmedRef}
              title={[clubName, booked.courtName].filter(Boolean).join(' · ')}
              location={clubName}
              startsAt={booked.start}
              endsAt={booked.end}
            />
          </div>
        )}
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/me/bookings" style={{ ...pillBtn, background: 'var(--lime)', color: 'var(--on-lime)' }}>
            {bk('myBookings')}
          </Link>
          <button type="button" onClick={() => setConfirmedRef(null)} style={pillBtn}>
            {bk('close')}
          </button>
        </div>
      </Modal>

      {/* Checkout modal for a selected free slot */}
      <Modal
        open={checkoutOpen && !!selected && confirmedRef === null}
        // Closing the dialog goes back to the bar with the slot still picked;
        // «cancel» inside it is what drops the selection.
        onClose={() => setCheckoutOpen(false)}
        title={bk('title')}
      >
        {selected && (
          <>
          <p className="mono" style={{ color: 'var(--ink-2)', fontSize: 13, marginBottom: 12 }}>
            {selected.courtName} · {dayLong.format(asUtcDate(date))} · {selected.time}–
            {addMinutes(selected.time, duration)} · {duration} {t('minutes')}
            {selected.priceCents != null ? ` · ${money.format(selected.priceCents / 100)}` : ''}
          </p>

          {me.isLoading ? (
            <p style={{ color: 'var(--ink-3)' }}>…</p>
          ) : !me.data ? (
            <div>
              <p style={{ color: 'var(--ink-2)', marginBottom: 10 }}>{bk('loginRequired')}</p>
              <Link
                href={`/login?returnTo=${encodeURIComponent(pathname)}`}
                style={{ ...pillBtn, background: 'var(--lime)', color: 'var(--on-lime)' }}
              >
                {bk('logIn')}
              </Link>
            </div>
          ) : !me.data.user.emailVerified ? (
            <p style={{ color: 'var(--clay)' }}>{bk('verifyRequired')}</p>
          ) : (
            <div>
              {selectableCoaches.length > 0 && (
                <>
                  <p style={{ ...labelText, marginBottom: 8 }}>{bk('withCoachQuestion')}</p>
                  <CoachPicker
                    coaches={selectableCoaches}
                    coachId={coachId}
                    serviceId={serviceId}
                    onChange={(c, sv) => {
                      setCoachId(c);
                      setServiceId(sv);
                    }}
                    formatMoney={(cents) => money.format(cents / 100)}
                  />
                </>
              )}
              {chosenService && (
                <p style={{ fontWeight: 700, marginBottom: 8 }}>
                  {bk('withCoach')}: {chosenCoach!.name} · {money.format(chosenService.priceCents / 100)}
                </p>
              )}
              {book.isError && (
                <p role="alert" style={{ color: 'var(--clay)', fontSize: 13, marginBottom: 8 }}>
                  {errorMessage(book.error, te, tt('error'))}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={book.isPending}
                  onClick={() => book.mutate('ON_SITE')}
                  style={{ ...pillBtn, background: 'var(--lime)', color: 'var(--on-lime)', fontWeight: 700 }}
                >
                  <BusyLabel busy={book.isPending}>{bk('confirmOnSite')}</BusyLabel>
                </button>
                <button
                  type="button"
                  aria-disabled
                  title={bk('payOnlineSoon')}
                  onClick={() => {
                    setOnlinePayNotice(true);
                    toast(bk('payOnlineSoon'), 'info');
                  }}
                  style={{ ...pillBtn, color: 'var(--ink-3)', cursor: 'not-allowed' }}
                >
                  {bk('payOnline')}
                </button>
                <button type="button" onClick={clearSelection} style={pillBtn}>
                  {bk('cancel')}
                </button>
              </div>
              {onlinePayNotice && (
                <p
                  role="status"
                  style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    border: '1px solid var(--line-2)',
                    borderRadius: 12,
                    background: 'var(--surface-2)',
                    color: 'var(--ink)',
                    fontSize: 13,
                  }}
                >
                  {bk('payOnlineSoon')}
                </p>
              )}
              <p style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 10 }}>{bk('payOnSiteNote')}</p>
            </div>
          )}
          </>
        )}
      </Modal>
    </section>
  );
}

const pillBtn: React.CSSProperties = {
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 16px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--pill)',
  cursor: 'pointer',
  textDecoration: 'none',
  fontWeight: 600,
};

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

const labelText: React.CSSProperties = { fontWeight: 700, fontSize: 13, color: 'var(--ink)' };
const retryBtn: React.CSSProperties = {
  minHeight: 40,
  marginLeft: 8,
  padding: '0 16px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--green-deep)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 700,
};
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
