'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { getMe, getMyClubs } from '@/lib/api';

export function AdminHome() {
  const t = useTranslations('Admin');
  const router = useRouter();
  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });

  useEffect(() => {
    if (me.isError) router.replace('/login?returnTo=/admin');
  }, [me.isError, router]);

  const clubs = useQuery({ queryKey: ['myClubs'], queryFn: getMyClubs, enabled: me.isSuccess });

  if (me.isLoading || me.isError) return <p style={{ color: 'var(--ink-3)' }}>…</p>;

  return (
    <div>
      <p style={{ color: 'var(--ink-2)', marginBottom: 20 }}>
        {t('signedInAs', { email: me.data!.user.email })}
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{t('yourClubs')}</h2>

      {clubs.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}
      {clubs.isSuccess && clubs.data.length === 0 && (
        <p style={{ color: 'var(--ink-2)' }}>{t('noClubs')}</p>
      )}
      {clubs.isSuccess && clubs.data.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {clubs.data.map((m) => (
            <Link
              key={m.club.id}
              href={`/admin/clubs/${m.club.id}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                textDecoration: 'none',
                color: 'var(--ink)',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                padding: 16,
              }}
            >
              <span>
                <span style={{ fontWeight: 700, fontSize: 17 }}>{m.club.name}</span>
                <span className="mono" style={{ display: 'block', color: 'var(--ink-3)', fontSize: 12 }}>
                  {m.role} · {m.club.status} · {m.club.slotIntervalMin}‑min slots
                </span>
              </span>
              <span aria-hidden style={{ color: 'var(--teal)' }}>
                {t('manage')} →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
