'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { getFavorites, getMe } from '@/lib/api';

export function FavoritesList() {
  const t = useTranslations('Favorites');
  const router = useRouter();
  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  useEffect(() => {
    if (me.isError) router.replace('/login?returnTo=/me/favorites');
  }, [me.isError, router]);
  const favs = useQuery({ queryKey: ['favorites'], queryFn: getFavorites, enabled: me.isSuccess });

  if (me.isLoading || me.isError) return <p style={{ color: 'var(--ink-3)' }}>…</p>;

  return (
    <div>
      {favs.isSuccess && favs.data.length === 0 && <p style={{ color: 'var(--ink-2)' }}>{t('empty')}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {(favs.data ?? []).map((c) => (
          <Link
            key={c.id}
            href={`/clubs/${c.slug}`}
            style={{ display: 'block', textDecoration: 'none', color: 'var(--ink)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 18, boxShadow: 'var(--shadow-sm)' }}
          >
            <div style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: 19 }}>♥ {c.name}</div>
            <div style={{ color: 'var(--ink-3)', fontSize: 14, marginTop: 4 }}>{c.cityName}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
