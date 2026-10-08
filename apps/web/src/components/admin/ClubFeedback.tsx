'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { adminGetClubFeedback } from '@/lib/api';
import { Stars } from '../Stars';

type Filter = 'all' | 'low' | 'coach';

/** What players said about this club's courts, lessons and group trainings. */
export function ClubFeedback({ clubId }: { clubId: number }) {
  const t = useTranslations('Feedback');
  const locale = useLocale();
  const q = useQuery({ queryKey: ['clubFeedback', clubId], queryFn: () => adminGetClubFeedback(clubId) });
  const [filter, setFilter] = useState<Filter>('all');

  const dtf = new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { dateStyle: 'medium' });
  const items = (q.data?.items ?? []).filter((i) =>
    filter === 'low' ? i.rating <= 3 : filter === 'coach' ? i.coachName !== null : true,
  );
  const typeLabel = (type: string) =>
    type === 'GROUP' ? t('typeGroup') : type === 'LESSON' ? t('typeLesson') : t('typeCourt');

  return (
    <section style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>
        {t('clubTitle')}
        {q.data && q.data.count > 0 && (
          <span style={{ fontSize: 15, color: 'var(--ink-2)', marginLeft: 10, fontWeight: 500 }}>
            ★ {q.data.averageRating?.toFixed(1)} · {t('countLabel', { count: q.data.count })}
          </span>
        )}
      </h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '4px 0 12px' }}>{t('clubHelp')}</p>

      {q.data && q.data.count > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {(['all', 'low', 'coach'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              style={{
                minHeight: 36,
                padding: '0 14px',
                borderRadius: 'var(--pill)',
                border: `1px solid ${filter === f ? 'var(--green-deep)' : 'var(--line-2)'}`,
                background: filter === f ? 'var(--green-deep)' : 'var(--surface)',
                color: filter === f ? '#fff' : 'var(--ink)',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {t(`filter.${f}`)}
            </button>
          ))}
        </div>
      )}

      {q.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}
      {q.isSuccess && q.data.count === 0 && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('clubEmpty')}</p>}

      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((i) => (
          <div key={i.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--surface-2)' }}>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                {i.title ?? typeLabel(i.type)}
                {i.coachName && <span style={{ fontWeight: 400, color: 'var(--ink-2)' }}> · {i.coachName}</span>}
              </span>
              <Stars value={i.rating} />
            </div>
            <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 2 }}>
              {i.authorName} · {dtf.format(new Date(i.startsAt))}
            </div>
            {i.comment && <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 6 }}>{i.comment}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 20,
  marginBottom: 20,
};
