'use client';

import { PushNotificationToggle } from '@/components/PushNotificationToggle';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { getMe, getMyClubs } from '@/lib/api';
import { enumLabel } from '@/lib/enums';
import { AdminStats } from './AdminStats';
import { PlatformConsole } from './PlatformConsole';
import { UsersModeration } from './UsersModeration';
import { ClubThumb } from '@/components/ClubThumb';
import { PageHeader } from '@/components/PageHeader';
import { SkeletonRows } from '@/components/Skeleton';

export function AdminHome() {
  const t = useTranslations('Admin');
  const te = useTranslations('Enums');
  const router = useRouter();
  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });

  useEffect(() => {
    if (me.isError) router.replace('/login?returnTo=/admin');
  }, [me.isError, router]);

  const clubs = useQuery({ queryKey: ['myClubs'], queryFn: getMyClubs, enabled: me.isSuccess });

  if (me.isLoading || me.isError) {
    return (
      <>
        <PageHeader title={t('title')} />
        <SkeletonRows rows={2} height={104} />
      </>
    );
  }
  const isPlatform = me.data!.user.roles.includes('PLATFORM_ADMIN');
  const list = clubs.data ?? [];

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('signedInAs', { email: me.data!.user.email })} />

      {isPlatform && <AdminStats scope="platform" />}
      {isPlatform && <PlatformConsole />}
      {isPlatform && <UsersModeration />}

      {list.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <PushNotificationToggle nudge="club" />
        </div>
      )}

      {/* The platform admin manages every club above; "your clubs" is for a club's own people. */}
      {!(isPlatform && clubs.isSuccess && list.length === 0) && (
        <h2 className="bk-h2">
          {t('yourClubs')}
          {list.length > 1 && <span>{list.length}</span>}
        </h2>
      )}

      {clubs.isLoading && <SkeletonRows rows={2} height={104} />}
      {clubs.isSuccess && list.length === 0 && !isPlatform && (
        <div className="srch-empty">
          <b>{t('noClubs')}</b>
          <span>{t('noClubsHelp')}</span>
        </div>
      )}
      {list.length > 0 && (
        <div className="adm-clubs">
          {list.map((m) => {
            const active = m.club.status === 'ACTIVE';
            const place = [m.club.city?.name, m.club.address].filter(Boolean).join(' · ');
            return (
              <article key={m.club.id} className="adm-club">
                <ClubThumb src={m.club.photoUrl} size={64} />
                <div className="adm-club-body">
                  <div className="bk-tags">
                    <span className="bk-tag is-game">{enumLabel(te, 'Role', m.role)}</span>
                    <span className={`bk-tag ${active ? 'is-ok' : 'is-wait'}`}>{enumLabel(te, 'ClubStatus', m.club.status)}</span>
                  </div>
                  <h3 className="adm-club-name">
                    <Link href={`/admin/clubs/${m.club.id}`}>{m.club.name}</Link>
                  </h3>
                  <p className="adm-club-meta">
                    {place && <span>{place}</span>}
                    <span>{t('slotLength', { n: m.club.slotIntervalMin })}</span>
                  </p>
                </div>
                <div className="adm-club-actions">
                  <Link href={`/admin/clubs/${m.club.id}`} className="acct-btn is-primary">
                    {t('manage')}
                  </Link>
                  <Link href={`/admin/clubs/${m.club.id}/calendar`} className="acct-btn">
                    {t('openCalendar')}
                  </Link>
                  {active && (
                    <Link href={`/clubs/${m.club.slug}`} className="acct-btn is-quiet">
                      {t('publicPage')} ↗
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
