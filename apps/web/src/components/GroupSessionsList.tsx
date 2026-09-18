'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { GroupSessionDto } from '@playslot/contracts';
import { useRouter } from '@/i18n/navigation';
import { getMe, listGroupSessions, registerGroupSession, unregisterGroupSession } from '@/lib/api';
import { formatInstant } from '@/lib/tz';

/**
 * Public list of upcoming coach-hosted group sessions with one-tap registration.
 * Optionally scoped to a club and/or a single coach.
 */
export function GroupSessionsList({
  clubId,
  coachProfileId,
  timezone = 'Europe/Sofia',
  heading,
}: {
  clubId?: number;
  coachProfileId?: number;
  timezone?: string;
  heading?: string;
}) {
  const t = useTranslations('GroupSessions');
  const qc = useQueryClient();
  const router = useRouter();

  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  const sessions = useQuery({
    queryKey: ['groupSessions', clubId ?? 'all'],
    queryFn: () => listGroupSessions(clubId),
  });

  const reg = useMutation({
    mutationFn: (id: number) => registerGroupSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groupSessions'] }),
  });
  const unreg = useMutation({
    mutationFn: (id: number) => unregisterGroupSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groupSessions'] }),
  });

  const items = (sessions.data ?? []).filter(
    (s) => !coachProfileId || s.coachProfileId === coachProfileId,
  );
  if (sessions.isSuccess && items.length === 0) return null;

  const h = heading ?? t('title');
  return (
    <section style={{ marginTop: 24 }}>
      {h && <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>{h}</h2>}
      <div style={{ display: 'grid', gap: 12 }}>
        {items.map((s) => (
          <Card
            key={s.id}
            s={s}
            timezone={timezone}
            signedIn={me.isSuccess}
            busy={reg.isPending || unreg.isPending}
            onRegister={() => (me.isSuccess ? reg.mutate(s.id) : router.push('/login?returnTo=/sessions'))}
            onUnregister={() => unreg.mutate(s.id)}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}

function Card({
  s,
  timezone,
  signedIn,
  busy,
  onRegister,
  onUnregister,
  t,
}: {
  s: GroupSessionDto;
  timezone: string;
  signedIn: boolean;
  busy: boolean;
  onRegister: () => void;
  onUnregister: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const full = s.spotsLeft <= 0 && !s.registered;
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
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            className="mono"
            style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--teal)', border: '1px solid var(--teal)', borderRadius: 999, padding: '2px 8px' }}
          >
            {t('badge')}
          </span>
          <h3 style={{ fontSize: 17, fontWeight: 700 }}>{s.title}</h3>
        </div>
        <p className="mono" style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 6 }}>
          {s.coachName} · {s.clubName}
        </p>
        {s.description && <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 6 }}>{s.description}</p>}
        <p className="mono" style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 8 }}>
          {formatInstant(s.startsAt, timezone)} ·{' '}
          {s.priceCents > 0 ? `${(s.priceCents / 100).toFixed(2)} ${s.currency}` : t('free')} ·{' '}
          {full ? t('full') : t('spotsLeft', { n: s.spotsLeft })}
        </p>
      </div>
      <div>
        {s.registered ? (
          <button type="button" onClick={onUnregister} disabled={busy} style={outlineBtn}>
            {t('leave')}
          </button>
        ) : (
          <button
            type="button"
            onClick={onRegister}
            disabled={busy || full}
            style={{ ...primaryBtn, opacity: full ? 0.5 : 1, cursor: full ? 'not-allowed' : 'pointer' }}
          >
            {signedIn ? t('join') : t('signInToJoin')}
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
  borderRadius: 'var(--pill)',
  fontWeight: 700,
  cursor: 'pointer',
};
const outlineBtn: React.CSSProperties = {
  minHeight: 44,
  padding: '0 18px',
  background: 'var(--surface)',
  color: 'var(--ink)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--pill)',
  fontWeight: 600,
  cursor: 'pointer',
};
