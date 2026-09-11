'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ClubTeamMemberDto } from '@playslot/contracts';
import { addClubCoach, addClubStaff, getClubTeam } from '@/lib/api';
import { AddMemberForm } from './AddMemberForm';

/** Club-admin management of the club's team: coaches and staff. */
export function TeamManager({ clubId }: { clubId: number }) {
  const t = useTranslations('Team');
  const qc = useQueryClient();
  const team = useQuery({ queryKey: ['clubTeam', clubId], queryFn: () => getClubTeam(clubId) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['clubTeam', clubId] });

  return (
    <section style={card}>
      <h2 style={h2}>{t('title')}</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '4px 0 14px' }}>{t('help')}</p>

      {/* coaches */}
      <h3 style={h3}>{t('coaches')}</h3>
      <MemberList members={team.data?.coaches ?? []} loading={team.isLoading} empty={t('noCoaches')} t={t} />
      <div style={{ marginTop: 10 }}>
        <AddMemberForm onSubmit={(input) => addClubCoach(clubId, input)} submitLabel={t('addCoach')} onDone={refresh} />
      </div>

      {/* staff */}
      <h3 style={{ ...h3, marginTop: 20 }}>{t('staff')}</h3>
      <MemberList members={team.data?.staff ?? []} loading={team.isLoading} empty={t('noStaff')} t={t} />
      <div style={{ marginTop: 10 }}>
        <AddMemberForm onSubmit={(input) => addClubStaff(clubId, input)} submitLabel={t('addStaff')} onDone={refresh} />
      </div>

      {/* admins (read-only here; assigned by platform) */}
      {(team.data?.admins.length ?? 0) > 0 && (
        <>
          <h3 style={{ ...h3, marginTop: 20 }}>{t('admins')}</h3>
          <MemberList members={team.data!.admins} loading={false} empty="" t={t} />
        </>
      )}
    </section>
  );
}

function MemberList({
  members,
  loading,
  empty,
  t,
}: {
  members: ClubTeamMemberDto[];
  loading: boolean;
  empty: string;
  t: ReturnType<typeof useTranslations>;
}) {
  if (loading) return <p style={{ color: 'var(--ink-3)' }}>…</p>;
  if (members.length === 0) return empty ? <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{empty}</p> : null;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {members.map((m) => (
        <div key={`${m.role}-${m.userId}`} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
          <span style={{ fontWeight: 600 }}>{m.name}</span>
          <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{m.email}</span>
          {m.pending && (
            <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--held)', border: '1px solid var(--held)', borderRadius: 999, padding: '2px 8px' }}>
              {t('pending')}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 20,
  boxShadow: 'var(--shadow-sm)',
};
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700 };
const h3: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 8 };
