'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { getMe, getMyStanding } from '@/lib/api';

/**
 * Shown to a player whose account a platform admin restricted. Online payment
 * of the fee is not wired yet, so the banner explains how to settle it.
 */
export function AccountStandingBanner() {
  const t = useTranslations('Standing');
  const locale = useLocale();
  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  const standing = useQuery({ queryKey: ['myStanding'], queryFn: getMyStanding, enabled: me.isSuccess });

  if (!standing.data?.suspended) return null;
  const s = standing.data;
  const fee = new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', {
    style: 'currency',
    currency: s.currency,
    maximumFractionDigits: 2,
  }).format(s.feeCents / 100);

  return (
    <div
      role="alert"
      style={{
        border: '1px solid var(--clay)',
        background: 'var(--surface)',
        borderRadius: 'var(--radius)',
        padding: 16,
        marginBottom: 20,
      }}
    >
      <strong style={{ color: 'var(--clay)' }}>{t('title')}</strong>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 4 }}>
        {t('reason', { reason: s.reason ? t(`reasons.${s.reason}` as 'reasons.OTHER') : t('reasons.OTHER') })}
        {s.note ? ` — ${s.note}` : ''}
      </p>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 6 }}>
        {s.feeCents > 0 ? t('feeBody', { fee }) : t('noFeeBody')}
      </p>
    </div>
  );
}
