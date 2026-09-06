'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { AvailabilitySlot, SlotState } from '@playslot/contracts';
import { Link, usePathname } from '@/i18n/navigation';
import { Modal } from '@/components/Modal';
import { CLIENT_BASE, coachesForClub, createReservation, fetchAvailability, getMe } from '@/lib/api';

// State → design token + non-color cue (icon). Never color-only (spec §7/§20).
const STATE_STYLE: Record<SlotState, { bg: string; fg: string; icon: string; bookable: boolean }> = {
  FREE: { bg: 'var(--free-soft)', fg: 'var(--free)', icon: '✓', bookable: true },
  RESERVED: { bg: 'var(--booked-soft)', fg: 'var(--booked)', icon: '×', bookable: false },
  MINE: { bg: 'var(--teal-soft)', fg: 'var(--teal)', icon: '★', bookable: false },
  UNAVAILABLE: { bg: 'var(--booked-soft)', fg: 'var(--ink-3)', icon: '–', bookable: false },
  PAST: { bg: 'var(--booked-soft)', fg: 'var(--ink-3)', icon: '·', bookable: false },
  EVENT: { bg: 'var(--event-soft)', fg: 'var(--event)', icon: '◆', bookable: false },
  TOURNAMENT: { bg: 'var(--event-soft)', fg: 'var(--event)', icon: '⚑', bookable: false },
};

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

/** HH:mm from an ISO string carrying the club offset (local wall-clock time). */
const hhmm = (iso: string) => iso.slice(11, 16);

interface SelectedSlot {
  resourceId: number;
  start: string;
  courtName: string;
  priceCents: number | null;
  time: string;
  coachIds: number[];
}

export function AvailabilityGrid({ clubId }: { clubId: number }) {
  const t = useTranslations('Grid');
  const st = useTranslations('SlotStates');
  const bk = useTranslations('Booking');
  const locale = useLocale();
  const pathname = usePathname();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [duration, setDuration] = useState(60);
  const [selected, setSelected] = useState<SelectedSlot | null>(null);
  const [confirmedRef, setConfirmedRef] = useState<number | null>(null);
  const [coachId, setCoachId] = useState<number | null>(null);
  const [serviceId, setServiceId] = useState<number | null>(null);

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

  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });

  // Live updates (spec §20): refetch when another viewer books/cancels here.
  useEffect(() => {
    const es = new EventSource(`${CLIENT_BASE}/api/availability/stream?clubId=${clubId}`);
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
      setSelected(null);
      setCoachId(null);
      setServiceId(null);
      qc.invalidateQueries({ queryKey: ['availability', clubId] });
    },
  });

  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', {
        style: 'currency',
        currency: query.data?.currency ?? 'EUR',
        maximumFractionDigits: 0,
      }),
    [locale, query.data?.currency],
  );

  // Build the time-row × court-column matrix.
  const { rows, byKey } = useMemo(() => {
    const slots = query.data?.slots ?? [];
    const times = [...new Set(slots.map((s) => hhmm(s.start)))].sort();
    const map = new Map<string, AvailabilitySlot>();
    for (const s of slots) map.set(`${s.resourceId}@${hhmm(s.start)}`, s);
    return { rows: times, byKey: map };
  }, [query.data]);

  const courts = query.data?.courts ?? [];
  // Booking-length options adapt to the club's slot time (30 → allow 30-min).
  const durations = (query.data?.slotIntervalMin ?? 60) === 30 ? [30, 60, 90, 120] : [60, 90, 120];

  return (
    <section aria-labelledby="grid-heading" style={{ marginTop: 8 }}>
      {/* Controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <button type="button" onClick={() => setDate(shiftDate(date, -1))} style={navBtn} aria-label={t('prevDay')}>
            ‹
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || todayIso())}
            style={dateInput}
            aria-label={t('date')}
          />
          <button type="button" onClick={() => setDate(shiftDate(date, 1))} style={navBtn} aria-label={t('nextDay')}>
            ›
          </button>
          <button type="button" onClick={() => setDate(todayIso())} style={todayBtn}>
            {t('today')}
          </button>
        </div>

        <label className="mono" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: 'var(--ink-3)' }}>{t('duration')}</span>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            style={dateInput}
          >
            {durations.map((d) => (
              <option key={d} value={d}>
                {d} {t('minutes')}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h2 id="grid-heading" className="sr-only" style={{ position: 'absolute', left: -9999 }}>
        {t('heading')}
      </h2>

      {/* States */}
      {query.isLoading && <GridSkeleton />}
      {query.isError && (
        <div role="alert" style={alertBox}>
          {t('error')}{' '}
          <button type="button" onClick={() => query.refetch()} style={{ ...todayBtn, marginLeft: 8 }}>
            {t('retry')}
          </button>
        </div>
      )}

      {query.isSuccess && courts.length === 0 && <div style={emptyBox}>{t('noCourts')}</div>}

      {query.isSuccess && courts.length > 0 && rows.length === 0 && (
        <div style={emptyBox}>{t('noSlots')}</div>
      )}

      {query.isSuccess && rows.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--radius)' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 120 + courts.length * 116 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--surface-2)', zIndex: 2 }}>
                  {t('time')}
                </th>
                {courts.map((c) => (
                  <th key={c.id} style={thStyle}>
                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500 }}>
                      {[c.surface, c.isIndoor ? t('indoor') : t('outdoor')].filter(Boolean).join(' · ')}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((time) => (
                <tr key={time}>
                  <th
                    scope="row"
                    className="mono"
                    style={{ ...timeCell, position: 'sticky', left: 0, background: 'var(--surface-2)', zIndex: 1 }}
                  >
                    {time}
                  </th>
                  {courts.map((c) => {
                    const slot = byKey.get(`${c.id}@${time}`);
                    if (!slot) return <td key={c.id} style={{ ...cell, background: 'var(--ground)' }} aria-hidden />;
                    const s = STATE_STYLE[slot.state];
                    const isSelected =
                      selected?.resourceId === c.id && selected?.start === slot.start;
                    const inner = (
                      <>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span aria-hidden className="mono" style={{ color: s.fg, fontWeight: 700 }}>
                            {s.icon}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{st(slot.state)}</span>
                        </span>
                        {s.bookable && slot.priceCents != null && (
                          <span style={{ fontWeight: 700, fontSize: 14 }}>
                            {money.format(slot.priceCents / 100)}
                          </span>
                        )}
                      </>
                    );
                    const boxStyle: React.CSSProperties = {
                      background: s.bg,
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 8px',
                      minHeight: 52,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      width: '100%',
                      textAlign: 'left',
                    };
                    return (
                      <td key={c.id} style={cell}>
                        {s.bookable ? (
                          <button
                            type="button"
                            title={bk('bookThisSlot')}
                            onClick={() => {
                              setCoachId(null);
                              setServiceId(null);
                              setSelected({
                                resourceId: c.id,
                                start: slot.start,
                                courtName: c.name,
                                priceCents: slot.priceCents,
                                time,
                                coachIds: slot.coachIds ?? [],
                              });
                            }}
                            style={{
                              ...boxStyle,
                              cursor: 'pointer',
                              color: 'var(--ink)',
                              ...(isSelected
                                ? {
                                    background: 'var(--teal-soft)',
                                    border: '2px solid var(--teal)',
                                    padding: '7px 7px',
                                  }
                                : {}),
                            }}
                          >
                            {inner}
                          </button>
                        ) : (
                          <div title={st(slot.state)} style={boxStyle}>
                            {inner}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation modal */}
      <Modal open={confirmedRef !== null} onClose={() => setConfirmedRef(null)} title={bk('confirmedTitle')}>
        <p style={{ color: 'var(--ink-2)' }}>{bk('confirmedBody', { ref: confirmedRef ?? 0 })}</p>
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
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
        open={!!selected && confirmedRef === null}
        onClose={() => {
          setSelected(null);
          setCoachId(null);
          setServiceId(null);
        }}
        title={bk('title')}
      >
        {selected && (
          <>
          <p className="mono" style={{ color: 'var(--ink-2)', fontSize: 13, marginBottom: 12 }}>
            {selected.courtName} · {date} · {selected.time} · {duration} {t('minutes')}
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
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-2)' }}>
                    {bk('coach')}
                    <select
                      value={coachId ?? ''}
                      onChange={(e) => {
                        const v = e.target.value ? Number(e.target.value) : null;
                        setCoachId(v);
                        const c = selectableCoaches.find((x) => x.coachProfileId === v);
                        setServiceId(c?.services[0]?.id ?? null);
                      }}
                      style={{ ...pillBtn, cursor: 'pointer' }}
                    >
                      <option value="">{bk('noCoach')}</option>
                      {selectableCoaches.map((c) => (
                        <option key={c.coachProfileId} value={c.coachProfileId}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {chosenCoach && chosenCoach.services.length > 0 && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-2)' }}>
                      {bk('service')}
                      <select
                        value={serviceId ?? ''}
                        onChange={(e) => setServiceId(e.target.value ? Number(e.target.value) : null)}
                        style={{ ...pillBtn, cursor: 'pointer' }}
                      >
                        {chosenCoach.services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} · {money.format(s.priceCents / 100)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
              {chosenService && (
                <p style={{ fontWeight: 700, marginBottom: 8 }}>
                  {bk('withCoach')}: {chosenCoach!.name} · {money.format(chosenService.priceCents / 100)}
                </p>
              )}
              {book.isError && (
                <p role="alert" style={{ color: 'var(--clay)', fontSize: 13, marginBottom: 8 }}>
                  {(book.error as Error).message}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={book.isPending}
                  onClick={() => book.mutate('ONLINE')}
                  style={{ ...pillBtn, background: 'var(--lime)', color: 'var(--on-lime)', fontWeight: 700 }}
                >
                  {book.isPending ? '…' : bk('payOnline')}
                </button>
                <button
                  type="button"
                  disabled={book.isPending}
                  onClick={() => book.mutate('ON_SITE')}
                  style={pillBtn}
                >
                  {bk('confirmOnSite')}
                </button>
                <button type="button" onClick={() => setSelected(null)} style={pillBtn}>
                  {bk('cancel')}
                </button>
              </div>
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
  borderRadius: 'var(--radius-sm)',
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

const navBtn: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 18,
  cursor: 'pointer',
};
const todayBtn: React.CSSProperties = {
  minHeight: 44,
  padding: '0 14px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  fontWeight: 600,
};
const dateInput: React.CSSProperties = {
  minHeight: 44,
  padding: '0 10px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
};
const thStyle: React.CSSProperties = {
  padding: '10px 8px',
  borderBottom: '1px solid var(--line)',
  fontSize: 13,
  textAlign: 'center',
  background: 'var(--surface-2)',
  whiteSpace: 'nowrap',
};
const timeCell: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  color: 'var(--ink-2)',
  borderBottom: '1px solid var(--line)',
  textAlign: 'right',
  whiteSpace: 'nowrap',
};
const cell: React.CSSProperties = { padding: 4, borderBottom: '1px solid var(--line)', verticalAlign: 'top' };
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
