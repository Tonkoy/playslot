'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { FeedbackItemDto } from '@playslot/contracts';
import { getMe, getMyFeedback, submitFeedback } from '@/lib/api';
import { Modal } from './Modal';
import { StarInput, Stars } from './Stars';
import { useToast } from './Toast';

/**
 * "How was it?" — past court bookings, lessons and group trainings the player
 * attended. Unrated ones come first; lesson/training ratings feed the coach's
 * public score.
 */
export function SessionFeedbackPanel() {
  const t = useTranslations('Feedback');
  const tt = useTranslations('Toasts');
  const locale = useLocale();
  const qc = useQueryClient();
  const toast = useToast();

  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  const items = useQuery({ queryKey: ['myFeedback'], queryFn: getMyFeedback, enabled: me.isSuccess });

  const [editing, setEditing] = useState<FeedbackItemDto | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [showRated, setShowRated] = useState(false);

  const open = (it: FeedbackItemDto) => {
    setEditing(it);
    setRating(it.myRating ?? 5);
    setComment(it.myComment ?? '');
  };

  const save = useMutation({
    mutationFn: () =>
      submitFeedback({
        kind: editing!.kind,
        id: editing!.id,
        rating,
        comment: comment.trim() || undefined,
      }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['myFeedback'] });
      toast(t('thanks'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  if (!items.isSuccess || items.data.length === 0) return null;

  const dtf = new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const unrated = items.data.filter((i) => i.myRating == null);
  const rated = items.data.filter((i) => i.myRating != null);
  const typeLabel = (i: FeedbackItemDto) =>
    i.type === 'GROUP' ? t('typeGroup') : i.type === 'LESSON' ? t('typeLesson') : t('typeCourt');

  const row = (i: FeedbackItemDto) => (
    <div key={`${i.kind}-${i.id}`} style={rowStyle}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700 }}>
          {i.title ?? typeLabel(i)}
          {i.coachName && <span style={{ fontWeight: 400, color: 'var(--ink-2)' }}> · {i.coachName}</span>}
        </div>
        <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 12 }}>
          {i.clubName} · {dtf.format(new Date(i.startsAt))}
        </div>
        {i.myComment && <div style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 4 }}>„{i.myComment}“</div>}
      </div>
      {i.myRating != null && <Stars value={i.myRating} />}
      <button type="button" onClick={() => open(i)} style={i.myRating == null ? primaryBtn : secondaryBtn}>
        {i.myRating == null ? t('rate') : t('edit')}
      </button>
    </div>
  );

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t('title')}</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '4px 0 12px' }}>{t('subtitle')}</p>

      {unrated.length > 0 ? (
        <div style={{ display: 'grid', gap: 10 }}>{unrated.map(row)}</div>
      ) : (
        <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('allRated')}</p>
      )}

      {rated.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowRated((v) => !v)}
            style={{ ...linkBtn, marginTop: 12 }}
            aria-expanded={showRated}
          >
            {showRated ? t('hideRated') : t('showRated', { count: rated.length })}
          </button>
          {showRated && <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>{rated.map(row)}</div>}
        </>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={t('modalTitle')}>
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            style={{ display: 'grid', gap: 14 }}
          >
            <p style={{ color: 'var(--ink-2)', fontSize: 14 }}>
              {editing.title ?? typeLabel(editing)}
              {editing.coachName ? ` · ${editing.coachName}` : ''} — {editing.clubName},{' '}
              {dtf.format(new Date(editing.startsAt))}
            </p>
            <StarInput value={rating} onChange={setRating} label={t('ratingLabel')} />
            <span style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: -8 }}>{t(`scale.${rating}` as 'scale.5')}</span>
            <label style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--ink-2)' }}>
              {editing.coachName ? t('commentCoach') : t('commentCourt')}
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder={t('commentPlaceholder')}
                style={{
                  padding: 10,
                  border: '1px solid var(--line-2)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </label>
            {editing.coachName && <p style={{ color: 'var(--ink-3)', fontSize: 12 }}>{t('publicNote')}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setEditing(null)} style={secondaryBtn}>
                {t('cancel')}
              </button>
              <button type="submit" disabled={save.isPending} style={primaryBtn}>
                {save.isPending ? '…' : t('submit')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap',
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 14,
};
const primaryBtn: React.CSSProperties = {
  minHeight: 40,
  padding: '0 16px',
  background: 'var(--lime)',
  color: 'var(--on-lime)',
  border: 'none',
  borderRadius: 'var(--pill)',
  fontWeight: 700,
  cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = {
  minHeight: 40,
  padding: '0 16px',
  background: 'var(--surface)',
  color: 'var(--ink)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--pill)',
  fontWeight: 600,
  cursor: 'pointer',
};
const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--teal)',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
};
