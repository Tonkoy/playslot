'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { getMe, getMyCoachProfile } from '@/lib/api';
import { CoachProfileEditor } from './CoachProfileEditor';
import { GroupSessionManager } from './GroupSessionManager';

export function CoachHubClient() {
  const t = useTranslations('CoachHub');
  const router = useRouter();

  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  useEffect(() => {
    if (me.isError) router.replace('/login?returnTo=/me/coach');
  }, [me.isError, router]);

  const isCoach = me.data?.user.roles.includes('COACH') ?? false;
  const profile = useQuery({ queryKey: ['coachProfile'], queryFn: getMyCoachProfile, enabled: me.isSuccess && isCoach });

  if (me.isLoading || me.isError) return <p style={{ color: 'var(--ink-3)' }}>…</p>;
  if (!isCoach) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 20, color: 'var(--ink-2)' }}>
        {t('coachesOnly')}{' '}
        <Link href="/me" style={{ color: 'var(--teal)' }}>← {t('backToAccount')}</Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <CoachProfileEditor name={me.data!.user.name} />
      {profile.data && <GroupSessionManager coachProfileId={profile.data.coachProfileId} />}
    </div>
  );
}
