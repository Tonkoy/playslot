'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { PLAYER_LEVELS, type PlayerLevel } from '@playslot/contracts';
import { getMyUserProfile, updateMyUserProfile } from '@/lib/api';
import { Avatar } from './Avatar';
import { Collapse } from './Collapse';
import { PushNotificationToggle } from './PushNotificationToggle';
import { useToast } from './Toast';
import { BusyLabel } from '@/components/Spinner';

interface Form {
  name: string;
  avatarUrl: string;
  bio: string;
  phone: string;
  level: PlayerLevel | null;
  notify: boolean;
  subscribed: boolean;
}
const EMPTY: Form = { name: '', avatarUrl: '', bio: '', phone: '', level: null, notify: true, subscribed: false };

/**
 * A user's own settings, in three cards — profile, playing level,
 * notifications — instead of one long form. Nothing is saved until asked: a
 * bar appears at the bottom as soon as something differs from what is stored,
 * with Save and Discard, so the save button is always in reach and it is
 * always clear whether there is anything to save.
 */
export function AccountProfileEditor() {
  const t = useTranslations('AccountSettings');
  const tt = useTranslations('Toasts');
  const lv = useTranslations('Levels');
  const qc = useQueryClient();
  const toast = useToast();

  const profile = useQuery({ queryKey: ['userProfile'], queryFn: getMyUserProfile });
  const [form, setForm] = useState<Form>(EMPTY);
  const [saved, setSaved] = useState<Form>(EMPTY);
  const [photoOpen, setPhotoOpen] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (!profile.data) return;
    const next: Form = {
      name: profile.data.name,
      avatarUrl: profile.data.avatarUrl ?? '',
      bio: profile.data.bio ?? '',
      phone: profile.data.phone ?? '',
      level: profile.data.level,
      notify: profile.data.notifyByEmail,
      subscribed: profile.data.subscribed,
    };
    setForm(next);
    setSaved(next);
  }, [profile.data]);

  const dirty = (Object.keys(form) as (keyof Form)[]).some((k) => form[k] !== saved[k]);
  const nameMissing = form.name.trim() === '';

  const save = useMutation({
    mutationFn: () =>
      updateMyUserProfile({
        name: form.name.trim(),
        avatarUrl: form.avatarUrl.trim(),
        bio: form.bio.trim(),
        notifyByEmail: form.notify,
        subscribed: form.subscribed,
        level: form.level,
        phone: form.phone.trim(),
      }),
    onSuccess: () => {
      setSaved(form);
      setPhotoOpen(false);
      qc.invalidateQueries({ queryKey: ['userProfile'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      toast(tt('profileSaved'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  return (
    <form
      className="acct-sections"
      style={{ paddingBottom: dirty ? 84 : 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && !nameMissing) save.mutate();
      }}
    >
      {/* ── profile ── */}
      <section className="acct-card">
        <h2 className="acct-h2">{t('sectionProfile')}</h2>

        <div className="acct-photo">
          <Avatar name={form.name || '?'} photoUrl={form.avatarUrl || null} size={64} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="acct-btn" onClick={() => setPhotoOpen((v) => !v)} aria-expanded={photoOpen}>
              {form.avatarUrl ? t('changePhoto') : t('addPhoto')}
            </button>
            {form.avatarUrl && (
              <button type="button" className="acct-btn is-quiet" onClick={() => set('avatarUrl', '')}>
                {t('removePhoto')}
              </button>
            )}
          </div>
        </div>
        <Collapse open={photoOpen}>
          <label className="acct-field" style={{ paddingTop: 12 }}>
            {t('avatarUrl')}
            <input
              type="url"
              value={form.avatarUrl}
              onChange={(e) => set('avatarUrl', e.target.value)}
              placeholder="https://…"
              className="acct-input"
            />
            <span className="acct-help">{t('photoHelp')}</span>
          </label>
        </Collapse>

        <div className="acct-grid2">
          <label className="acct-field">
            {t('name')}
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="acct-input"
              autoComplete="name"
              aria-invalid={nameMissing && dirty}
            />
            {nameMissing && dirty && <span className="acct-help is-error">{t('nameRequired')}</span>}
          </label>
          <label className="acct-field">
            {t('phone')}
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder={t('phonePlaceholder')}
              className="acct-input"
            />
          </label>
        </div>
        <p className="acct-help" style={{ marginTop: 6 }}>
          {t('phoneHelp')}
        </p>

        <label className="acct-field" style={{ marginTop: 14 }}>
          {t('bio')}
          <textarea
            value={form.bio}
            onChange={(e) => set('bio', e.target.value)}
            rows={3}
            className="acct-input"
            style={{ minHeight: 84, padding: '10px 12px', resize: 'vertical' }}
          />
        </label>
      </section>

      {/* ── playing level: each choice says what it means ── */}
      <section className="acct-card">
        <h2 className="acct-h2">{t('levelTitle')}</h2>
        <p className="acct-help" style={{ margin: '-6px 0 14px' }}>
          {t('levelHelp')}
        </p>
        <div className="acct-levels" role="group" aria-label={t('levelTitle')}>
          {PLAYER_LEVELS.map((value) => {
            const on = form.level === value;
            return (
              <button
                key={value}
                type="button"
                // Clicking the chosen level clears it — "not set" is a valid
                // answer, and there is no other control to get back to it.
                onClick={() => set('level', on ? null : value)}
                aria-pressed={on}
                className={`acct-level${on ? ' is-on' : ''}`}
              >
                <span className="acct-level-top">
                  <strong>{lv(value)}</strong>
                  <span className="acct-level-check" aria-hidden>
                    ✓
                  </span>
                </span>
                <span className="acct-level-desc">{t(DESC_KEY[value])}</span>
              </button>
            );
          })}
        </div>
        {form.level === null && <p className="acct-help" style={{ marginTop: 10 }}>{t('levelNone')}</p>}
      </section>

      {/* ── notifications ── */}
      <section className="acct-card">
        <h2 className="acct-h2">{t('sectionNotifications')}</h2>
        <div className="acct-rows">
          <Switch
            label={t('notify')}
            help={t('notifyHelp')}
            checked={form.notify}
            onChange={(v) => set('notify', v)}
          />
          <Switch
            label={t('newsletter')}
            help={t('newsletterHelp')}
            checked={form.subscribed}
            onChange={(v) => set('subscribed', v)}
          />
          {/* Browser push is per-device and saves itself, so it has its own
              button rather than pretending to be part of the form. */}
          <PushNotificationToggle plain />
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
              <button type="submit" className="acct-btn is-primary" disabled={save.isPending || nameMissing}>
                <BusyLabel busy={save.isPending}>{t('save')}</BusyLabel>
              </button>
            </span>
          </div>
        </div>
      )}
    </form>
  );
}

/** A labelled on/off switch (a real checkbox underneath, so it works with a keyboard). */
function Switch({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="acct-row">
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontWeight: 600, fontSize: 14 }}>{label}</strong>
        <span className="acct-help" style={{ display: 'block', marginTop: 2 }}>
          {help}
        </span>
      </span>
      <input type="checkbox" role="switch" className="acct-switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Level → the AccountSettings key holding its plain-language description. */
const DESC_KEY: Record<PlayerLevel, 'levelBeginnerDesc' | 'levelIntermediateDesc' | 'levelAdvancedDesc'> = {
  beginner: 'levelBeginnerDesc',
  intermediate: 'levelIntermediateDesc',
  advanced: 'levelAdvancedDesc',
};
