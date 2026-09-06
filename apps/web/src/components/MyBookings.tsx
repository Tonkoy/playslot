'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { cancelMyReservation, getMe, getMyReservations } from '@/lib/api';

const CANCELLABLE = ['HOLD', 'PENDING_PAYMENT', 'CONFIRMED'];

export function MyBookings() {
  const t = useTranslations('MyBookings');
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();

  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  useEffect(() => {
    if (me.isError) router.replace('/login?returnTo=/me/bookings');
  }, [me.isError, router]);

  const list = useQuery({
    queryKey: ['myReservations'],
    queryFn: getMyReservations,
    enabled: me.isSuccess,
  });
  const cancel = useMutation({
    mutationFn: (id: number) => cancelMyReservation(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['myReservations'] });
      if (res.refundCents > 0) {
        window.alert(t('refundNote', { amount: (res.refundCents / 100).toFixed(0) }));
      }
    },
    onError: (e) => window.alert(e instanceof Error ? e.message : String(e)),
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
      <div>
        <div style={{ fontWeight: 700 }}>{r.clubName ?? `#${r.clubId}`}</div>
        <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 12 }}>
          {dtf.format(new Date(r.startsAt))} · {r.type} · {money(r.priceCents, r.currency)}
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
        {r.status}
      </span>
      {CANCELLABLE.includes(r.status) && (
        <button
          type="button"
          onClick={() => cancel.mutate(r.id)}
          disabled={cancel.isPending}
          style={{
            marginLeft: 'auto',
            minHeight: 40,
            padding: '0 14px',
            border: '1px solid var(--clay)',
            color: 'var(--clay)',
            background: 'var(--surface)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
        >
          {t('cancel')}
        </button>
      )}
    </div>
  );

  return (
    <div>
      {list.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}
      {list.isSuccess && all.length === 0 && <p style={{ color: 'var(--ink-2)' }}>{t('empty')}</p>}

      {upcoming.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{t('upcoming')}</h2>
          <div style={{ display: 'grid', gap: 12 }}>{upcoming.map(row)}</div>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{t('past')}</h2>
          <div style={{ display: 'grid', gap: 12 }}>{past.map(row)}</div>
        </section>
      )}
    </div>
  );
}
