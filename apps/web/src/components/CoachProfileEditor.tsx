'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { COACH_LEVELS, WORKS_WITH } from '@playslot/contracts';
import { getMyCoachProfile, updateMyCoachProfile } from '@/lib/api';
import { enumLabel } from '@/lib/enums';
import { BusyLabel } from '@/components/Spinner';
import { Avatar } from './Avatar';
import { Collapse } from './Collapse';
import { useToast } from './Toast';

const LANGUAGES = ['bg', 'en'];

interface Form {
  photoUrl: string;
  bio: string;
  rate: number | '';
  experience: number | '';
  levels: string[];
  languages: string[];
  worksWith: string[];
}
const EMPTY: Form = { photoUrl: '', bio: '', rate: '', experience: '', levels: [], languages: [], worksWith: [] };
/** Order of the chips a coach ticked does not make the profile "changed". */
const fingerprint = (f: Form) =>
  JSON.stringify({ ...f, levels: [...f.levels].sort(), languages: [...f.languages].sort(), worksWith: [...f.worksWith].sort() });

/**
 * The coach edits what players see of them: photo, a few words, price,
 * experience and who they work with. Laid out like the account page — cards,
 * and a save bar that appears only once something has changed.
 */
export function CoachProfileEditor({ name }: { name: string }) {
  const t = useTranslations('CoachProfile');
  const te = useTranslations('Enums');
  const lv = useTranslations('Levels');
  const ag = useTranslations('AgeGroups');
  const tt = useTranslations('Toasts');
  const qc = useQueryClient();
  const toast = useToast();

  const profile = useQuery({ queryKey: ['coachProfile'], queryFn: getMyCoachProfile });
  const [saved, setSaved] = useState<Form>(EMPTY);
  const [form, setForm] = useState<Form>(EMPTY);
  const [photoOpen, setPhotoOpen] = useState(false);

  useEffect(() => {
    if (!profile.data) return;
    const next: Form = {
      photoUrl: profile.data.photoUrl ?? '',
      bio: profile.data.bio ?? '',
      rate: profile.data.hourlyRateCents != null ? profile.data.hourlyRateCents / 100 : '',
      experience: profile.data.experienceYears ?? '',
      levels: profile.data.levels ?? [],
      languages: profile.data.languages ?? [],
      worksWith: profile.data.worksWith ?? [],
    };
    setSaved(next);
    setForm(next);
  }, [profile.data]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key: 'levels' | 'languages' | 'worksWith', value: string) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }));
  const dirty = fingerprint(form) !== fingerprint(saved);

  const save = useMutation({
    mutationFn: () =>
      updateMyCoachProfile({
        photoUrl: form.photoUrl.trim(),
        bio: form.bio.trim(),
        hourlyRateCents: form.rate === '' ? null : Math.round(Number(form.rate) * 100),
        experienceYears: form.experience === '' ? null : Number(form.experience),
        levels: form.levels,
        languages: form.languages,
        worksWith: form.worksWith,
      }),
    onSuccess: () => {
      setSaved(form);
      qc.invalidateQueries({ queryKey: ['coachProfile'] });
      toast(tt('profileSaved'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  const chips = (key: 'levels' | 'languages' | 'worksWith', options: readonly string[], label: (v: string) => string, title: string) => (
    <div>
      <div className="acct-field" style={{ marginBottom: 8 }}>
        {title}
      </div>
      <div className="coach-chips" role="group" aria-label={title}>
        {options.map((o) => {
          const on = form[key].includes(o);
          return (
            <button key={o} type="button" className={`coach-chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggle(key, o)}>
              {on && <span aria-hidden>✓ </span>}
              {label(o)}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <form
      className="acct-sections"
      style={{ paddingBottom: dirty ? 84 : 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) save.mutate();
      }}
    >
      {/* ── what players see first ── */}
      <section className="acct-card">
        <h2 className="acct-h2">{t('title')}</h2>

        <div className="acct-photo">
          <Avatar name={name} photoUrl={form.photoUrl || null} size={64} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="acct-btn" onClick={() => setPhotoOpen((v) => !v)} aria-expanded={photoOpen}>
              {form.photoUrl ? t('changePhoto') : t('addPhoto')}
            </button>
            {form.photoUrl && (
              <button type="button" className="acct-btn is-quiet" onClick={() => set('photoUrl', '')}>
                {t('removePhoto')}
              </button>
            )}
          </div>
        </div>
        <Collapse open={photoOpen}>
          <label className="acct-field" style={{ paddingTop: 12 }}>
            {t('photoUrl')}
            <input
              type="url"
              value={form.photoUrl}
              onChange={(e) => set('photoUrl', e.target.value)}
              placeholder="https://…"
              className="acct-input"
            />
            <span className="acct-help">{t('photoHelp')}</span>
          </label>
        </Collapse>

        <label className="acct-field" style={{ marginTop: 16 }}>
          {t('bio')}
          <textarea
            value={form.bio}
            onChange={(e) => set('bio', e.target.value)}
            rows={4}
            className="acct-input"
            style={{ minHeight: 104, padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }}
          />
          <span className="acct-help">{t('bioHelp')}</span>
        </label>
      </section>

      {/* ── price and experience ── */}
      <section className="acct-card">
        <h2 className="acct-h2">{t('sectionRate')}</h2>
        <div className="acct-grid2" style={{ marginTop: 0 }}>
          <label className="acct-field">
            {t('hourlyRate')}
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={form.rate}
              onChange={(e) => set('rate', e.target.value === '' ? '' : Number(e.target.value))}
              className="acct-input"
            />
          </label>
          <label className="acct-field">
            {t('experienceYears')}
            <input
              type="number"
              min={0}
              max={80}
              inputMode="numeric"
              value={form.experience}
              onChange={(e) => set('experience', e.target.value === '' ? '' : Number(e.target.value))}
              className="acct-input"
            />
          </label>
        </div>
      </section>

      {/* ── who the coach works with ── */}
      <section className="acct-card">
        <h2 className="acct-h2">{t('sectionAudience')}</h2>
        <div style={{ display: 'grid', gap: 18 }}>
          {chips('worksWith', WORKS_WITH, (v) => ag(v), t('worksWith'))}
          {chips('levels', COACH_LEVELS, (v) => lv(v), t('levels'))}
          {chips('languages', LANGUAGES, (v) => enumLabel(te, 'Language', v), t('languages'))}
        </div>
      </section>

      {/* ── unsaved changes ── */}
      {dirty && (
        <div className="acct-savebar" role="region" aria-label={t('unsaved')}>
          <div>
            <span className="acct-savebar-text">{t('unsaved')}</span>
            <span className="acct-savebar-actions">
              <button type="button" className="acct-btn" onClick={() => setForm(saved)} disabled={save.isPending}>
                {t('discard')}
              </button>
              <button type="submit" className="acct-btn is-primary" disabled={save.isPending}>
                <BusyLabel busy={save.isPending}>{t('save')}</BusyLabel>
              </button>
            </span>
          </div>
        </div>
      )}
    </form>
  );
}
