'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { getFavorites, getMe } from '@/lib/api';
import { CourtMark } from './ClubThumb';

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
            style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', textDecoration: 'none', color: 'var(--ink)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)' }}
          >
            {/* Same card as the clubs list: the club's picture on top (whole,
                never cropped), or the court mark when it has none. */}
            <div
              style={{
                position: 'relative',
                height: 160,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                background: 'var(--surface-2)',
                borderBottom: '1px solid var(--line)',
              }}
            >
              {c.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote club hosts; see ClubThumb
                <img
                  src={c.photoUrl}
                  alt=""
                  loading="lazy"
                  style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', padding: 14, boxSizing: 'border-box' }}
                />
              ) : (
                <CourtMark />
              )}
              <span
                aria-hidden
                style={{ position: 'absolute', top: 10, right: 10, width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--clay)', fontSize: 15 }}
              >
                ♥
              </span>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: 19 }}>{c.name}</div>
              <div style={{ color: 'var(--ink-3)', fontSize: 14, marginTop: 4 }}>
                {[c.cityName, c.address].filter(Boolean).join(' · ')}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
