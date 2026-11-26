'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { getMe, getMyCoachProfile } from '@/lib/api';
import { Avatar } from './Avatar';
import { CoachProfileEditor } from './CoachProfileEditor';
import { Modal } from './Modal';
import { GroupSessionManager, MyGroupSessions } from './GroupSessionManager';
import { PushNotificationToggle } from './PushNotificationToggle';

const ICON = {
  calendar: 'M2.5 4.5h11v9h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3',
  user: 'M8 8a2.75 2.75 0 100-5.5A2.75 2.75 0 008 8zM2.75 13.5c.6-2.3 2.7-3.5 5.25-3.5s4.65 1.2 5.25 3.5',
  eye: 'M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8zM8 9.75a1.75 1.75 0 100-3.5 1.75 1.75 0 000 3.5z',
} as const;

/** Coach hub: who the coach is on the left, their public profile and group trainings on the right. */
export function CoachHubClient() {
  const t = useTranslations('CoachHub');
  const tg = useTranslations('GroupSessions');
  const router = useRouter();
  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  useEffect(() => {
    if (me.isError) router.replace('/login?returnTo=/me/coach');
  }, [me.isError, router]);

  const isCoach = me.data?.user.roles.includes('COACH') ?? false;
  const profile = useQuery({ queryKey: ['coachProfile'], queryFn: getMyCoachProfile, enabled: me.isSuccess && isCoach });
  const [creating, setCreating] = useState(false);

  if (me.isLoading || me.isError) return <p style={{ color: 'var(--ink-3)' }}>…</p>;
  if (!isCoach) {
    return (
      <div className="acct-card" style={{ color: 'var(--ink-2)' }}>
        {t('coachesOnly')}{' '}
        <Link href="/me" style={{ color: 'var(--teal)' }}>← {t('backToAccount')}</Link>
      </div>
    );
  }

  const user = me.data!.user;
  const links: { href: string; label: string; icon: keyof typeof ICON }[] = [
    { href: '/me/schedule', label: t('schedule'), icon: 'calendar' },
    ...(profile.data
      ? [{ href: `/coaches/${profile.data.coachProfileId}`, label: t('publicPage'), icon: 'eye' as const }]
      : []),
    { href: '/me', label: t('account'), icon: 'user' },
  ];

  return (
    <div className="acct">
      <aside className="acct-side">
        <section className="acct-card acct-id">
          <Avatar name={user.name} photoUrl={profile.data?.photoUrl ?? null} size={72} />
          <div style={{ minWidth: 0 }}>
            <h2 className="acct-name">{user.name}</h2>
            <div className="acct-badges">
              <span className="acct-badge is-ok">{t('roleCoach')}</span>
            </div>
          </div>
        </section>

        {/* The main thing a coach does here: in reach at once, not at the end of the page. */}
        {profile.data && (
          <button type="button" className="chub-create" onClick={() => setCreating(true)}>
            <span className="chub-create-plus" aria-hidden>
              +
            </span>
            <span>
              <b>{t('createSession')}</b>
              <small>{t('createSessionHelp')}</small>
            </span>
          </button>
        )}

        <nav className="acct-card acct-nav" aria-label={t('shortcuts')}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="acct-nav-link">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={ICON[l.icon]} />
              </svg>
              <span>{l.label}</span>
              <span className="acct-nav-chev" aria-hidden>
                ›
              </span>
            </Link>
          ))}
        </nav>
      </aside>

      <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
        <PushNotificationToggle nudge="coach" />
        {/* What is coming up first; the profile and the form to open a new one after it. */}
        <MyGroupSessions />
        <CoachProfileEditor name={user.name} />
      </div>

      {profile.data && (
        <Modal open={creating} onClose={() => setCreating(false)} title={tg('createTitle')}>
          <GroupSessionManager coachProfileId={profile.data.coachProfileId} onCreated={() => setCreating(false)} />
        </Modal>
      )}
    </div>
  );
}
