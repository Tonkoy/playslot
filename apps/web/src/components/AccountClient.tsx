'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { getMe, getMyMemberships, logout } from '@/lib/api';
import { AccountProfileEditor } from './AccountProfileEditor';
import { Avatar } from './Avatar';
import { BusyLabel } from '@/components/Spinner';

const ROLE_KEYS: Record<string, string> = {
  PLATFORM_ADMIN: 'rolePlatformAdmin',
  CLUB_ADMIN: 'roleClubAdmin',
  CLUB_STAFF: 'roleClubStaff',
  COACH: 'roleCoach',
  PLAYER: 'rolePlayer',
};

/** Line icons for the shortcut list (16px, drawn with the current colour). */
const ICONS = {
  bookings: 'M2.5 4.5h11v9h-11zM2.5 7.5h11M5.5 2.5v3M10.5 2.5v3',
  favorites: 'M8 13.5S2.5 10.3 2.5 6.4A2.9 2.9 0 0 1 8 5a2.9 2.9 0 0 1 5.5 1.4c0 3.9-5.5 7.1-5.5 7.1z',
  coach: 'M8 8a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8 8zM2.75 13.5a5.25 5.25 0 0 1 10.5 0',
  schedule: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 4.75V8l2.25 1.5',
  club: 'M2.5 13.5v-8l5.5-3 5.5 3v8M6.5 13.5v-3.5h3v3.5',
} as const;

/**
 * The account page. Two columns on a wide screen: who you are and where you
 * can go on the left (it stays in view), what you can change on the right.
 * One column on a phone, in the same order. Sign-out is a quiet action at the
 * end of the side column, not the first button under the name.
 */
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
  const isStaff = user.roles.some((r) => r === 'CLUB_ADMIN' || r === 'CLUB_STAFF' || r === 'PLATFORM_ADMIN');
  const isCoach = user.roles.includes('COACH');
  const activeMemberships = (memberships.data ?? []).filter((m) => m.active);

  const links: { href: string; label: string; icon: keyof typeof ICONS }[] = [
    ...(isCoach ? [] : ([{ href: '/me/bookings', label: t('myBookings'), icon: 'bookings' }] as const)),
    { href: '/me/favorites', label: t('myFavorites'), icon: 'favorites' },
    ...(isCoach
      ? ([
          { href: '/me/coach', label: t('coachProfile'), icon: 'coach' },
          { href: '/me/schedule', label: t('mySchedule'), icon: 'schedule' },
        ] as const)
      : []),
    ...(isStaff ? ([{ href: '/admin', label: t('manageClub'), icon: 'club' }] as const) : []),
  ];

  return (
    <div className="acct">
      <aside className="acct-side">
        {/* identity */}
        <section className="acct-card acct-id">
          <Avatar name={user.name} photoUrl={user.avatarUrl} size={72} />
          <div style={{ minWidth: 0 }}>
            <h1 className="acct-name">{user.name}</h1>
            <p className="acct-email">{user.email}</p>
            <div className="acct-badges">
              <span className={`acct-badge ${user.emailVerified ? 'is-ok' : 'is-warn'}`}>
                {user.emailVerified ? `✓ ${t('verified')}` : t('notVerified')}
              </span>
              {user.roles.map((r) => (
                <span key={r} className="acct-badge">
                  {ROLE_KEYS[r] ? t(ROLE_KEYS[r]) : r}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* where to go */}
        <nav className="acct-card acct-nav" aria-label={t('shortcuts')}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="acct-nav-link">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={ICONS[l.icon]} />
              </svg>
              <span>{l.label}</span>
              <span className="acct-nav-chev" aria-hidden>
                ›
              </span>
            </Link>
          ))}
        </nav>

        {/* active memberships */}
        {activeMemberships.length > 0 && (
          <section className="acct-card">
            <h2 className="acct-h2">{t('memberships')}</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {activeMemberships.map((m) => (
                <div key={m.id}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <strong>{m.clubName}</strong>
                    <span className="mono" style={{ color: 'var(--teal)', fontWeight: 700 }}>
                      −{m.discountPercent}%
                    </span>
                  </div>
                  <div style={{ color: 'var(--ink-2)', fontSize: 13 }}>
                    {m.planName} · {t('until', { date: m.validUntil.slice(0, 10) })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <button type="button" onClick={() => logoutMut.mutate()} disabled={logoutMut.isPending} className="acct-logout">
          <BusyLabel busy={logoutMut.isPending}>{t('logout')}</BusyLabel>
        </button>
      </aside>

      <div className="acct-main">
        <AccountProfileEditor />
      </div>
    </div>
  );
}
