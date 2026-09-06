'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { addFavorite, getFavorites, getMe, removeFavorite } from '@/lib/api';

export function FavoriteButton({ clubId }: { clubId: number }) {
  const t = useTranslations('Favorites');
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  const favs = useQuery({ queryKey: ['favorites'], queryFn: getFavorites, enabled: me.isSuccess });
  const isFav = (favs.data ?? []).some((c) => c.id === clubId);

  const toggle = useMutation({
    mutationFn: () => (isFav ? removeFavorite(clubId) : addFavorite(clubId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites'] }),
  });

  const base: React.CSSProperties = {
    minHeight: 40,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 14px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--line-2)',
    background: 'var(--surface)',
    color: 'var(--ink)',
    cursor: 'pointer',
    textDecoration: 'none',
    fontSize: 14,
  };

  if (me.isSuccess && !me.data) {
    return (
      <Link href="/login?returnTo=/clubs" style={base}>
        ♡ {t('save')}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending || !me.isSuccess}
      aria-pressed={isFav}
      style={{ ...base, borderColor: isFav ? 'var(--clay)' : 'var(--line-2)', color: isFav ? 'var(--clay)' : 'var(--ink)' }}
    >
      {isFav ? '♥' : '♡'} {isFav ? t('saved') : t('save')}
    </button>
  );
}
