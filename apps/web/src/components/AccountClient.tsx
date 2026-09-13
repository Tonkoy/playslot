'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { getMe, getMyMemberships, logout } from '@/lib/api';
import { AccountProfileEditor } from './AccountProfileEditor';
import { Avatar } from './Avatar';

const ROLE_KEYS: Record<string, string> = {
  PLATFORM_ADMIN: 'rolePlatformAdmin',
  CLUB_ADMIN: 'roleClubAdmin',
  CLUB_STAFF: 'roleClubStaff',
  COACH: 'roleCoach',
  PLAYER: 'rolePlayer',
};

export function AccountClient() {
  const t = useTranslations('Account');
  const router = useRouter();
  const qc = useQueryClient();

  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  useEffect(() => {
    if (me.isError) router.replace('/login?returnTo=/me');
  }, [me.isError, router]);

  const memberships = useQuery({
    queryKey: ['myMemberships'],
    queryFn: getMyMemberships,
    enabled: me.isSuccess,
  });

  const logoutMut = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      qc.clear();
      router.replace('/');
      router.refresh();
    },
  });

  if (me.isLoading || me.isError) return <p style={{ color: 'var(--ink-3)' }}>…</p>;
  const user = me.data!.user;
  const isStaff = user.roles.some((r) => r === 'CLUB_ADMIN' || r === 'CLUB_STAFF');
  const isCoach = user.roles.includes('COACH');
  const activeMemberships = (memberships.data ?? []).filter((m) => m.active);

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {/* identity card */}
      <section style={card}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Avatar name={user.name} photoUrl={user.avatarUrl} size={64} />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>{user.name}</h1>
            <p style={{ color: 'var(--ink-2)', marginTop: 4, wordBreak: 'break-all' }}>{user.email}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <span
                className="mono"
                style={{
                  ...pill,
                  color: user.emailVerified ? 'var(--teal)' : 'var(--clay)',
                  borderColor: user.emailVerified ? 'var(--teal)' : 'var(--clay)',
                }}
              >
                {user.emailVerified ? t('verified') : t('notVerified')}
              </span>
              {user.roles.map((r) => (
                <span key={r} className="mono" style={pill}>
                  {ROLE_KEYS[r] ? t(ROLE_KEYS[r]) : r}
                </span>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => logoutMut.mutate()}
          disabled={logoutMut.isPending}
          style={{
            marginTop: 20,
            minHeight: 44,
            padding: '0 20px',
            border: '1px solid var(--clay)',
            color: 'var(--clay)',
            background: 'var(--surface)',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {logoutMut.isPending ? '…' : t('logout')}
        </button>
      </section>

      {/* account settings */}
      <AccountProfileEditor />

      {/* quick links */}
      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {isCoach && <AccountLink href="/me/coach" label={t('coachProfile')} />}
        {isCoach && <AccountLink href="/me/schedule" label={t('mySchedule')} />}
        <AccountLink href="/me/bookings" label={t('myBookings')} />
        <AccountLink href="/me/favorites" label={t('myFavorites')} />
        {isStaff && <AccountLink href="/admin" label={t('manageClub')} />}
      </section>

      {/* active memberships */}
      {activeMemberships.length > 0 && (
        <section style={card}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{t('memberships')}</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {activeMemberships.map((m) => (
              <div key={m.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <strong>{m.clubName}</strong>
                <span style={{ color: 'var(--ink-2)' }}>{m.planName}</span>
                <span className="mono" style={{ color: 'var(--teal)', fontWeight: 700 }}>−{m.discountPercent}%</span>
                <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 12, marginLeft: 'auto' }}>
                  {t('until', { date: m.validUntil.slice(0, 10) })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AccountLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        ...card,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        textDecoration: 'none',
        color: 'var(--ink)',
        fontWeight: 700,
      }}
    >
      {label}
      <span aria-hidden style={{ color: 'var(--teal)' }}>→</span>
    </Link>
  );
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 20,
  boxShadow: 'var(--shadow-sm)',
};
const pill: React.CSSProperties = {
  fontSize: 12,
  padding: '3px 10px',
  borderRadius: 100,
  border: '1px solid var(--line-2)',
  color: 'var(--ink-2)',
};
