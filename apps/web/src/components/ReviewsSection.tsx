'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { getClubReviews, getMe, submitReview } from '@/lib/api';

function Stars({ n }: { n: number }) {
  return (
    <span aria-label={`${n}/5`} style={{ color: 'var(--held)', letterSpacing: 1 }}>
      {'★'.repeat(n)}
      <span style={{ color: 'var(--line-2)' }}>{'★'.repeat(5 - n)}</span>
    </span>
  );
}

export function ReviewsSection({ clubId }: { clubId: number }) {
  const t = useTranslations('Reviews');
  const locale = useLocale();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  const reviews = useQuery({ queryKey: ['reviews', clubId], queryFn: () => getClubReviews(clubId) });

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () => submitReview(clubId, { rating, comment: comment.trim() || undefined }),
    onSuccess: () => {
      setComment('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['reviews', clubId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const dtf = new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { dateStyle: 'medium' });
  const data = reviews.data;

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 700, marginBottom: 12 }}>
        {t('title')}
        {data && data.count > 0 && (
          <span style={{ fontSize: 16, color: 'var(--ink-2)', marginLeft: 10 }}>
            ★ {data.averageRating} · {t('count', { count: data.count })}
          </span>
        )}
      </h2>

      {me.isSuccess && me.data && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-2)' }}>
              {t('rating')}
              <select value={rating} onChange={(e) => setRating(Number(e.target.value))} style={ctrl}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} ★
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-2)', flex: 1, minWidth: 180 }}>
              {t('comment')}
              <input value={comment} onChange={(e) => setComment(e.target.value)} style={ctrl} placeholder={t('commentPlaceholder')} />
            </label>
            <button
              type="button"
              onClick={() => submit.mutate()}
              disabled={submit.isPending}
              style={{ ...ctrl, background: 'var(--lime)', color: 'var(--on-lime)', border: 'none', fontWeight: 700, cursor: 'pointer' }}
            >
              {t('submit')}
            </button>
          </div>
          {error && <p style={{ color: 'var(--clay)', fontSize: 13, marginTop: 8 }}>{t('needBooking')}</p>}
        </div>
      )}

      {reviews.isSuccess && data && data.count === 0 && <p style={{ color: 'var(--ink-2)' }}>{t('empty')}</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {(data?.reviews ?? []).map((r) => (
          <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong>{r.authorName}</strong>
              <Stars n={r.rating} />
            </div>
            {r.comment && <p style={{ color: 'var(--ink-2)', margin: '6px 0 0' }}>{r.comment}</p>}
            <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 11 }}>{dtf.format(new Date(r.createdAt))}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const ctrl: React.CSSProperties = {
  minHeight: 44,
  padding: '0 10px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
};
