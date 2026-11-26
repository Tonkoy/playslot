'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ReservationSummary } from '@playslot/contracts';
import { Link, useRouter } from '@/i18n/navigation';
import { cancelMyReservation, getMe, getMyReservations } from '@/lib/api';
import { enumLabel } from '@/lib/enums';
import { ClubThumb } from './ClubThumb';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { SkeletonRows } from '@/components/Skeleton';
import { BusyLabel } from '@/components/Spinner';
import { BookingsCalendar } from './BookingsCalendar';
import { AddToCalendar } from './AddToCalendar';
import { OpenGameButton } from './OpenGame';

type View = 'list' | 'calendar';
const VIEW_KEY = 'playslot.bookingsView';

const CANCELLABLE = ['HOLD', 'PENDING_PAYMENT', 'PENDING_APPROVAL', 'CONFIRMED'];
/** How many past bookings show before "show all". */
const PAST_SHOWN = 4;
/** The colour a status is said in: settled, waiting on someone, off, or went wrong. */
const STATUS_TONE: Record<string, 'ok' | 'wait' | 'off' | 'bad' | 'plain'> = {
  CONFIRMED: 'ok',
  COMPLETED: 'plain',
  HOLD: 'wait',
  PENDING_PAYMENT: 'wait',
  PENDING_APPROVAL: 'wait',
  CANCELLED: 'off',
  REFUNDED: 'off',
  NO_SHOW: 'bad',
};

export function MyBookings() {
  const t = useTranslations('MyBookings');
  const tg = useTranslations('Games');
  const tt = useTranslations('Toasts');
  const st = useTranslations('ReservationStatus');
  const te = useTranslations('Enums');
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  useEffect(() => {
    if (me.isError) router.replace('/login?returnTo=/me/bookings');
  }, [me.isError, router]);

  const list = useQuery({
    queryKey: ['myReservations'],
    queryFn: getMyReservations,
    enabled: me.isSuccess,
  });
  const [pending, setPending] = useState<ReservationSummary | null>(null);
  const [allPast, setAllPast] = useState(false);
  // List or calendar; the choice is remembered on this device.
  const [view, setView] = useState<View>('list');
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === 'calendar') setView('calendar');
    } catch {
      /* storage blocked: stay on the list */
    }
  }, []);
  const chooseView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const cancel = useMutation({
    mutationFn: (id: number) => cancelMyReservation(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['myReservations'] });
      setPending(null);
      toast(res.refundCents > 0 ? t('refundNote', { amount: (res.refundCents / 100).toFixed(0) }) : tt('cancelled'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  const loc = locale === 'bg' ? 'bg-BG' : 'en-GB';
  // Clubs are in Bulgaria; a booking is read in the club's time wherever the player is.
  const part = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(loc, { ...opts, timeZone: 'Europe/Sofia' }).format(new Date(iso));
  const time = (iso: string) => part(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const longDay = (iso: string) => part(iso, { weekday: 'long', day: 'numeric', month: 'long' });
  const dtf = { format: (d: Date) => `${longDay(d.toISOString())}, ${time(d.toISOString())}` };
  const money = (cents: number, ccy: string) =>
    new Intl.NumberFormat(loc, { style: 'currency', currency: ccy, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  const rel = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
  /** "tomorrow", "in 3 days", "in 2 hours" — how soon the next booking is. */
  const soon = (iso: string, from: number) => {
    const min = Math.round((new Date(iso).getTime() - from) / 60_000);
    if (min < 60) return rel.format(Math.max(1, min), 'minute');
    if (min < 24 * 60) return rel.format(Math.round(min / 60), 'hour');
    return rel.format(Math.round(min / (24 * 60)), 'day');
  };

  if (me.isLoading || me.isError) return <p style={{ color: 'var(--ink-3)' }}>…</p>;

  const now = Date.now();
  const all = list.data ?? [];
  const upcoming = all
    .filter((r) => new Date(r.startsAt).getTime() >= now && !['CANCELLED', 'REFUNDED', 'NO_SHOW'].includes(r.status))
    // soonest first: the next one is what people open this page for
    .sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  const past = all.filter((r) => !upcoming.includes(r));
  const nextId = upcoming[0]?.id ?? null;
  const shownPast = allPast ? past : past.slice(0, PAST_SHOWN);

  const row = (r: (typeof all)[number]) => {
    const ahead = new Date(r.startsAt).getTime() > now;
    const live = CANCELLABLE.includes(r.status) && ahead;
    const off = !upcoming.includes(r);
    const minutes = Math.round((new Date(r.endsAt).getTime() - new Date(r.startsAt).getTime()) / 60_000);
    return (
      <article key={r.id} className={`bk-card${off ? ' is-off' : ''}${r.id === nextId ? ' is-next' : ''}`}>
        {/* when */}
        <div className="bk-date">
          <small>{part(r.startsAt, { weekday: 'short' })}</small>
          <b>{part(r.startsAt, { day: 'numeric' })}</b>
          {/* the month in letters: a short month is a number in Bulgarian */}
          <small>{part(r.startsAt, { month: 'long' }).slice(0, 3)}</small>
          <span className="mono">{time(r.startsAt)}</span>
        </div>

        {/* what and where */}
        <div className="bk-body">
          <div className="bk-tags">
            {r.id === nextId && <span className="bk-tag is-next">{t('next', { when: soon(r.startsAt, now) })}</span>}
            <span className={`bk-tag is-${STATUS_TONE[r.status] ?? 'plain'}`}>{st.has(r.status) ? st(r.status) : r.status}</span>
            <span className="bk-tag">{enumLabel(te, 'ReservationType', r.type)}</span>
            {r.groupSessionId != null && <span className="bk-tag is-game">{tg('openTag')}</span>}
          </div>
          <h3 className="bk-title">
            <ClubThumb src={r.clubPhotoUrl ?? null} size={30} />
            {r.clubName ?? `#${r.clubId}`}
          </h3>
          <p className="bk-meta">
            {[r.courtName, r.coachName && t('withCoach', { name: r.coachName }), `${time(r.startsAt)}–${time(r.endsAt)}`, t('minutes', { n: minutes })]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        {/* price and number */}
        <div className="bk-side">
          <b>{money(r.priceCents, r.currency)}</b>
          <small className="mono">
            {t('bookingRef')} {r.id}
          </small>
        </div>

        {/* what can be done with it: only while it is still ahead and on */}
        {live && (
          <div className="bk-actions">
            <AddToCalendar
              reservationId={r.id}
              title={`${enumLabel(te, 'ReservationType', r.type)} · ${r.clubName ?? ''}`}
              location={r.clubName}
              startsAt={r.startsAt}
              endsAt={r.endsAt}
              compact
            />
            {/* A confirmed court ahead can be opened to other players — or already is. */}
            {r.type === 'COURT' &&
              r.status === 'CONFIRMED' &&
              (r.groupSessionId ? (
                <Link href={`/sessions#gs-${r.groupSessionId}`} className="bk-game is-open">
                  {tg('seeGame')}
                </Link>
              ) : (
                <OpenGameButton
                  className="bk-game"
                  booking={{
                    id: r.id,
                    priceCents: r.priceCents,
                    currency: r.currency,
                    summary: `${dtf.format(new Date(r.startsAt))} · ${r.clubName ?? ''}`,
                  }}
                />
              ))}
            <button type="button" className="bk-cancel" onClick={() => setPending(r)}>
              {t('cancel')}
            </button>
          </div>
        )}
      </article>
    );
  };

  return (
    <div>
      {list.isSuccess && all.length > 0 && (
        <div className="view-switch" role="tablist" aria-label={t('viewLabel')}>
          {(['list', 'calendar'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className={view === v ? 'is-on' : undefined}
              onClick={() => chooseView(v)}
            >
              <span aria-hidden>{v === 'list' ? '☰' : '▦'}</span> {t(v === 'list' ? 'viewList' : 'viewCalendar')}
            </button>
          ))}
        </div>
      )}
      {list.isLoading && <SkeletonRows />}
      {list.isSuccess && all.length === 0 && (
        <div className="bk-empty">
          <b>{t('empty')}</b>
          <p>{t('emptyHelp')}</p>
          <Link href="/clubs" className="acct-btn is-primary">
            {t('bookCourt')}
          </Link>
        </div>
      )}

      {view === 'calendar' && list.isSuccess && all.length > 0 && <BookingsCalendar bookings={all} renderRow={row} />}

      {view === 'list' && list.isSuccess && all.length > 0 && (
        <div className="bk-lists">
          <section>
            <h2 className="bk-h2">
              {t('upcoming')} <span>{upcoming.length}</span>
            </h2>
            {upcoming.length > 0 ? (
              <div className="bk-list">{upcoming.map(row)}</div>
            ) : (
              <div className="bk-empty is-inline">
                <p>{t('noneAhead')}</p>
                <Link href="/clubs" className="acct-btn is-primary">
                  {t('bookCourt')}
                </Link>
              </div>
            )}
          </section>
          {past.length > 0 && (
            <section>
              <h2 className="bk-h2">
                {t('past')} <span>{past.length}</span>
              </h2>
              <div className="bk-list">{shownPast.map(row)}</div>
              {past.length > PAST_SHOWN && (
                <button type="button" className="acct-btn bk-more" aria-expanded={allPast} onClick={() => setAllPast((v) => !v)}>
                  {allPast ? t('showFewer') : t('showAll', { n: past.length })}
                </button>
              )}
            </section>
          )}
        </div>
      )}

      <Modal open={pending !== null} onClose={() => setPending(null)} title={t('cancelConfirmTitle')}>
        {pending && (
          <div style={{ display: 'grid', gap: 16 }}>
            <p style={{ color: 'var(--ink-2)' }}>
              {t('cancelConfirmBody', {
                ref: `#${pending.id}`,
                club: pending.clubName ?? `#${pending.clubId}`,
                when: dtf.format(new Date(pending.startsAt)),
              })}
            </p>
            <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>{t('cancelConfirmNote')}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="acct-btn" onClick={() => setPending(null)}>
                {t('keepBooking')}
              </button>
              <button type="button" className="acct-btn bk-confirm-cancel" onClick={() => cancel.mutate(pending.id)} disabled={cancel.isPending}>
                <BusyLabel busy={cancel.isPending}>{t('confirmCancel')}</BusyLabel>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
