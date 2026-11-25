'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ReservationSummary } from '@playslot/contracts';
import { useRouter } from '@/i18n/navigation';
import { cancelMyReservation, getMe, getMyReservations } from '@/lib/api';
import { enumLabel } from '@/lib/enums';
import { ClubThumb } from './ClubThumb';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { SkeletonRows } from '@/components/Skeleton';
import { BusyLabel } from '@/components/Spinner';
import { BookingsCalendar } from './BookingsCalendar';
import { AddToCalendar } from './AddToCalendar';

type View = 'list' | 'calendar';
const VIEW_KEY = 'playslot.bookingsView';

const CANCELLABLE = ['HOLD', 'PENDING_PAYMENT', 'PENDING_APPROVAL', 'CONFIRMED'];

export function MyBookings() {
  const t = useTranslations('MyBookings');
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
      toast(tt('cancelled'));
      if (res.refundCents > 0) {
        window.alert(t('refundNote', { amount: (res.refundCents / 100).toFixed(0) }));
      }
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  const dtf = new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const money = (cents: number, ccy: string) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', {
      style: 'currency',
      currency: ccy,
      maximumFractionDigits: 0,
    }).format(cents / 100);

  if (me.isLoading || me.isError) return <p style={{ color: 'var(--ink-3)' }}>…</p>;

  const now = Date.now();
  const all = list.data ?? [];
  const upcoming = all.filter(
    (r) => new Date(r.startsAt).getTime() >= now && !['CANCELLED', 'REFUNDED', 'NO_SHOW'].includes(r.status),
  );
  const past = all.filter((r) => !upcoming.includes(r));

  const row = (r: (typeof all)[number]) => (
    <div
      key={r.id}
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: 16,
      }}
    >
      <ClubThumb src={r.clubPhotoUrl ?? null} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>{r.clubName ?? `#${r.clubId}`}</div>
        <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 12 }}>
          {dtf.format(new Date(r.startsAt))} · {enumLabel(te, 'ReservationType', r.type)} ·{' '}
          {money(r.priceCents, r.currency)}
        </div>
        <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 2 }}>
          {t('bookingRef')}: <strong>#{r.id}</strong>
        </div>
      </div>
      <span
        className="mono"
        style={{
          fontSize: 12,
          padding: '4px 10px',
          borderRadius: 100,
          border: '1px solid var(--line-2)',
          color: r.status === 'CANCELLED' ? 'var(--ink-3)' : 'var(--teal)',
        }}
      >
        {st.has(r.status) ? st(r.status) : r.status}
      </span>
      {/* Upcoming and still on: add it to the phone's calendar, or cancel it.
          A booking that has already started cannot be cancelled from here.
          The two actions stay together when the row wraps on a phone. */}
      {CANCELLABLE.includes(r.status) && new Date(r.startsAt).getTime() > now && (
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <AddToCalendar
            reservationId={r.id}
            title={`${enumLabel(te, 'ReservationType', r.type)} · ${r.clubName ?? ''}`}
            location={r.clubName}
            startsAt={r.startsAt}
            endsAt={r.endsAt}
            compact
          />
          <button
            type="button"
            onClick={() => setPending(r)}
            style={{
              minHeight: 40,
              padding: '0 14px',
              border: '1px solid var(--clay)',
              color: 'var(--clay)',
              background: 'var(--surface)',
              borderRadius: 'var(--pill)',
              cursor: 'pointer',
            }}
          >
            {t('cancel')}
          </button>
        </div>
      )}
    </div>
  );

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
      {list.isSuccess && all.length === 0 && <p style={{ color: 'var(--ink-2)' }}>{t('empty')}</p>}

      {view === 'calendar' && list.isSuccess && all.length > 0 && <BookingsCalendar bookings={all} renderRow={row} />}

      {view === 'list' && upcoming.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{t('upcoming')}</h2>
          <div style={{ display: 'grid', gap: 12 }}>{upcoming.map(row)}</div>
        </section>
      )}
      {view === 'list' && past.length > 0 && (
        <section>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{t('past')}</h2>
          <div style={{ display: 'grid', gap: 12 }}>{past.map(row)}</div>
        </section>
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
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setPending(null)}
                style={{
                  minHeight: 44,
                  padding: '0 18px',
                  border: '1px solid var(--line-2)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  borderRadius: 'var(--pill)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {t('keepBooking')}
              </button>
              <button
                type="button"
                onClick={() => cancel.mutate(pending.id)}
                disabled={cancel.isPending}
                style={{
                  minHeight: 44,
                  padding: '0 18px',
                  border: 'none',
                  background: 'var(--clay)',
                  color: '#fff',
                  borderRadius: 'var(--pill)',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                <BusyLabel busy={cancel.isPending}>{t('confirmCancel')}</BusyLabel>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
