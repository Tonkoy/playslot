'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { EventDto } from '@playslot/contracts';
import { useRouter } from '@/i18n/navigation';
import { getMe, listEvents, registerEvent, unregisterEvent } from '@/lib/api';
import { formatInstant } from '@/lib/tz';
import { useToast } from './Toast';

/** Public events/tournaments for a club, with one-tap registration (spec §22 M9). */
export function EventsSection({
  clubId,
  currency,
  timezone,
}: {
  clubId: number;
  currency: string;
  timezone: string;
}) {
  const t = useTranslations('Events');
  const tt = useTranslations('Toasts');
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();

  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  const events = useQuery({ queryKey: ['events', clubId], queryFn: () => listEvents(clubId) });

  const regMut = useMutation({
    mutationFn: (id: number) => registerEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events', clubId] });
      toast(tt('eventRegistered'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });
  const unregMut = useMutation({
    mutationFn: (id: number) => unregisterEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events', clubId] });
      toast(tt('eventUnregistered'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  if (events.isSuccess && events.data.length === 0) return null;

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>{t('title')}</h2>
      {events.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {events.data?.map((e) => (
          <EventCard
            key={e.id}
            ev={e}
            currency={currency}
            timezone={timezone}
            signedIn={me.isSuccess}
            busy={regMut.isPending || unregMut.isPending}
            onRegister={() => {
              if (!me.isSuccess) {
                router.push(`/login?returnTo=/clubs`);
                return;
              }
              regMut.mutate(e.id);
            }}
            onUnregister={() => unregMut.mutate(e.id)}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}

function EventCard({
  ev,
  currency,
  timezone,
  signedIn,
  busy,
  onRegister,
  onUnregister,
  t,
}: {
  ev: EventDto;
  currency: string;
  timezone: string;
  signedIn: boolean;
  busy: boolean;
  onRegister: () => void;
  onUnregister: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const full = ev.spotsLeft <= 0 && !ev.registered;
  const when = formatInstant(ev.startsAt, timezone);
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: 16,
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            className="mono"
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--teal)',
              border: '1px solid var(--teal)',
              borderRadius: 999,
              padding: '2px 8px',
            }}
          >
            {ev.type === 'TOURNAMENT' ? t('tournament') : t('event')}
          </span>
          <h3 style={{ fontSize: 17, fontWeight: 700 }}>{ev.title}</h3>
        </div>
        {ev.description && (
          <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 6 }}>{ev.description}</p>
        )}
        <p className="mono" style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 8 }}>
          {when} · {ev.feeCents > 0 ? `${(ev.feeCents / 100).toFixed(2)} ${currency}` : t('free')} ·{' '}
          {full ? t('full') : t('spotsLeft', { n: ev.spotsLeft })}
        </p>
      </div>
      <div>
        {ev.registered ? (
          <button type="button" onClick={onUnregister} disabled={busy} style={outlineBtn}>
            {t('cancelRegistration')}
          </button>
        ) : (
          <button
            type="button"
            onClick={onRegister}
            disabled={busy || full}
            style={{ ...primaryBtn, opacity: full ? 0.5 : 1, cursor: full ? 'not-allowed' : 'pointer' }}
          >
            {signedIn ? t('register') : t('signInToRegister')}
          </button>
        )}
      </div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  minHeight: 44,
  padding: '0 20px',
  background: 'var(--lime)',
  color: 'var(--on-lime)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 700,
  cursor: 'pointer',
};
const outlineBtn: React.CSSProperties = {
  minHeight: 44,
  padding: '0 18px',
  background: 'var(--surface)',
  color: 'var(--ink)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 600,
  cursor: 'pointer',
};
