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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['myReservations'] }),
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

  return (
    <div>
      {list.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}
      {list.isSuccess && list.data.length === 0 && <p style={{ color: 'var(--ink-2)' }}>{t('empty')}</p>}
      {list.isSuccess && list.data.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {list.data.map((r) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
