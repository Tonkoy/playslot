'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { COACH_LEVELS } from '@playslot/contracts';
import { Link } from '@/i18n/navigation';
import { getMyCoachProfile, updateMyCoachProfile } from '@/lib/api';
import { Avatar } from './Avatar';
import { useToast } from './Toast';

const LANGUAGES = ['bg', 'en'];

/** The coach edits their public profile: photo, description and hourly rate. */
export function CoachProfileEditor({ name }: { name: string }) {
  const t = useTranslations('CoachProfile');
  const lv = useTranslations('Levels');
  const tt = useTranslations('Toasts');
  const qc = useQueryClient();
  const toast = useToast();

  const profile = useQuery({ queryKey: ['coachProfile'], queryFn: getMyCoachProfile });
  const [photoUrl, setPhotoUrl] = useState('');
  const [bio, setBio] = useState('');
  const [rate, setRate] = useState<number | ''>('');
  const [levels, setLevels] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);

  useEffect(() => {
    if (!profile.data) return;
    setPhotoUrl(profile.data.photoUrl ?? '');
    setBio(profile.data.bio ?? '');
    setRate(profile.data.hourlyRateCents != null ? profile.data.hourlyRateCents / 100 : '');
    setLevels(profile.data.levels ?? []);
    setLanguages(profile.data.languages ?? []);
  }, [profile.data]);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const save = useMutation({
    mutationFn: () =>
      updateMyCoachProfile({
        photoUrl: photoUrl.trim(),
        bio: bio.trim(),
        hourlyRateCents: rate === '' ? null : Math.round(Number(rate) * 100),
        levels,
        languages,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coachProfile'] });
      toast(tt('profileSaved'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  return (
    <section style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t('title')}</h2>
        {profile.data && (
          <Link href={`/coaches/${profile.data.coachProfileId}`} style={{ color: 'var(--teal)', fontSize: 14 }}>
            {t('preview')} →
          </Link>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '14px 0' }}>
        <Avatar name={name} photoUrl={photoUrl || null} size={72} />
        <label style={{ ...fieldLabel, flex: 1 }}>
          {t('photoUrl')}
          <input
            type="url"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="https://…"
            style={fieldInput}
          />
        </label>
      </div>

      <label style={{ ...fieldLabel, marginBottom: 14 }}>
        {t('bio')}
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          style={{ ...fieldInput, minHeight: 76, padding: '8px 10px', resize: 'vertical' }}
        />
      </label>

      <label style={{ ...fieldLabel, maxWidth: 220 }}>
        {t('hourlyRate')}
        <input
          type="number"
          min={0}
          step="0.01"
          value={rate}
          onChange={(e) => setRate(e.target.value === '' ? '' : Number(e.target.value))}
          style={fieldInput}
        />
      </label>

      {/* levels */}
      <div style={{ marginTop: 16 }}>
        <div style={{ ...fieldLabel, marginBottom: 8 }}>{t('levels')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {COACH_LEVELS.map((l) => {
            const on = levels.includes(l);
            return (
              <button
                key={l}
                type="button"
                onClick={() => toggle(levels, setLevels, l)}
                aria-pressed={on}
                style={chip(on)}
              >
                {lv(l)}
              </button>
            );
          })}
        </div>
      </div>

      {/* languages */}
      <div style={{ marginTop: 14 }}>
        <div style={{ ...fieldLabel, marginBottom: 8 }}>{t('languages')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {LANGUAGES.map((l) => {
            const on = languages.includes(l);
            return (
              <button
                key={l}
                type="button"
                onClick={() => toggle(languages, setLanguages, l)}
                aria-pressed={on}
                className="mono"
                style={chip(on)}
              >
                {l.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          style={{ minHeight: 44, padding: '0 20px', background: 'var(--lime)', color: 'var(--on-lime)', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 700, cursor: 'pointer' }}
        >
          {save.isPending ? '…' : t('save')}
        </button>
      </div>
    </section>
  );
}

function chip(on: boolean): React.CSSProperties {
  return {
    minHeight: 40,
    padding: '0 14px',
    borderRadius: 999,
    border: `1.5px solid ${on ? 'var(--ink)' : 'var(--line-2)'}`,
    background: on ? 'var(--lime)' : 'var(--surface)',
    color: on ? 'var(--on-lime)' : 'var(--ink-2)',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: on ? 700 : 500,
  };
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 20,
  boxShadow: 'var(--shadow-sm)',
};
const fieldLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  color: 'var(--ink-2)',
};
const fieldInput: React.CSSProperties = {
  minHeight: 44,
  padding: '0 10px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
};
