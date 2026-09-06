'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { getClubMembershipPlans, getMe, getMyMemberships } from '@/lib/api';

/**
 * Public membership offering for a club (spec §9). Shows plans and their booking
 * discount; a signed-in member sees their active discount highlighted. Pricing is
 * applied server-side, so the availability grid already reflects any discount.
 */
export function MembershipPlansSection({ clubId, currency }: { clubId: number; currency: string }) {
  const t = useTranslations('Memberships');
  const plans = useQuery({
    queryKey: ['membershipPlans', clubId],
    queryFn: () => getClubMembershipPlans(clubId),
  });
  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  const mine = useQuery({
    queryKey: ['myMemberships'],
    queryFn: getMyMemberships,
    enabled: me.isSuccess,
  });

  const activeHere = mine.data?.find((m) => m.clubId === clubId && m.active);

  if (plans.isSuccess && plans.data.length === 0) return null;

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>{t('title')}</h2>

      {activeHere && (
        <p
          style={{
            background: 'var(--lime)',
            color: 'var(--on-lime)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          {t('activeBadge', { plan: activeHere.planName, percent: activeHere.discountPercent })}
        </p>
      )}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {plans.data?.map((p) => (
          <div
            key={p.id}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius)',
              padding: 16,
            }}
          >
            <h3 style={{ fontSize: 17, fontWeight: 700 }}>{p.name}</h3>
            <p style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>
              {(p.priceCents / 100).toFixed(2)}{' '}
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-3)' }}>{currency}</span>
            </p>
            <p className="mono" style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
              {t('duration', { days: p.durationDays })}
            </p>
            <p style={{ marginTop: 8, color: 'var(--teal)', fontWeight: 700 }}>
              {t('discount', { percent: p.discountPercent })}
            </p>
          </div>
        ))}
      </div>
      <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 10 }}>{t('howToJoin')}</p>
    </section>
  );
}
