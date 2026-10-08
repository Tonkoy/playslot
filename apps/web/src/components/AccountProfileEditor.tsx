'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { PLAYER_LEVELS, type PlayerLevel } from '@playslot/contracts';
import { getMyUserProfile, updateMyUserProfile } from '@/lib/api';
import { Avatar } from './Avatar';
import { PushNotificationToggle } from './PushNotificationToggle';
import { useToast } from './Toast';

/** A user's own account settings: name, avatar, bio, notification + newsletter prefs. */
export function AccountProfileEditor() {
  const t = useTranslations('AccountSettings');
  const tt = useTranslations('Toasts');
  const lv = useTranslations('Levels');
  const qc = useQueryClient();
  const toast = useToast();

  const profile = useQuery({ queryKey: ['userProfile'], queryFn: getMyUserProfile });
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [notify, setNotify] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [level, setLevel] = useState<PlayerLevel | null>(null);
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!profile.data) return;
    setName(profile.data.name);
    setAvatarUrl(profile.data.avatarUrl ?? '');
    setBio(profile.data.bio ?? '');
    setNotify(profile.data.notifyByEmail);
    setSubscribed(profile.data.subscribed);
    setLevel(profile.data.level);
    setPhone(profile.data.phone ?? '');
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () =>
      updateMyUserProfile({
        name: name.trim(),
        avatarUrl: avatarUrl.trim(),
        bio: bio.trim(),
        notifyByEmail: notify,
        subscribed,
        level,
        phone: phone.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userProfile'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      toast(tt('profileSaved'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  return (
    <section style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>{t('title')}</h2>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14 }}>
        <Avatar name={name || '?'} photoUrl={avatarUrl || null} size={72} />
        <label style={{ ...field, flex: 1 }}>
          {t('avatarUrl')}
          <input type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" style={input} />
        </label>
      </div>

      <label style={{ ...field, marginBottom: 12 }}>
        {t('name')}
        <input value={name} onChange={(e) => setName(e.target.value)} style={input} />
      </label>

      <label style={{ ...field, marginBottom: 12 }}>
        {t('phone')}
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t('phonePlaceholder')}
          style={input}
        />
        <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{t('phoneHelp')}</span>
      </label>

      <label style={{ ...field, marginBottom: 4 }}>
        {t('bio')}
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} style={{ ...input, minHeight: 76, padding: '8px 10px', resize: 'vertical' }} />
      </label>

      {/* ── playing level ── */}
      <fieldset style={{ border: 0, padding: 0, margin: '18px 0 0' }}>
        <legend style={{ fontWeight: 600, fontSize: 14, padding: 0 }}>{t('levelTitle')}</legend>
        <p style={{ color: 'var(--ink-3)', fontSize: 12, margin: '4px 0 10px' }}>{t('levelHelp')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PLAYER_LEVELS.map((value) => {
            const on = level === value;
            const description = t(DESC_KEY[value]);
            return (
              <button
                key={value}
                type="button"
                // Clicking the active level clears it — "not set" is a valid
                // answer, and there is no other control to get back to it.
                onClick={() => setLevel(on ? null : value)}
                aria-pressed={on}
                // Native tooltip on hover, and the same text is rendered below
                // for the chosen level so touch users and screen readers get it.
                title={description}
                style={{
                  minHeight: 40,
                  padding: '0 16px',
                  borderRadius: 'var(--pill)',
                  border: `2px solid ${on ? 'var(--green-deep)' : 'var(--line-2)'}`,
                  background: on ? 'var(--lime)' : 'var(--surface)',
                  color: on ? 'var(--on-lime)' : 'var(--ink)',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                {lv(value)}
              </button>
            );
          })}
        </div>
        <p style={{ color: 'var(--ink-2)', fontSize: 13, margin: '10px 0 0', minHeight: 34 }}>
          {level ? t(DESC_KEY[level]) : t('levelNone')}
        </p>
      </fieldset>

      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {/* Browser push is per-device and saves itself, so it sits outside the
            form's Save button rather than pretending to be part of it. */}
        <PushNotificationToggle />
        <label style={toggleRow}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          <span>
            <strong style={{ fontWeight: 600 }}>{t('notify')}</strong>
            <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 12 }}>{t('notifyHelp')}</span>
          </span>
        </label>
        <label style={toggleRow}>
          <input type="checkbox" checked={subscribed} onChange={(e) => setSubscribed(e.target.checked)} />
          <span>
            <strong style={{ fontWeight: 600 }}>{t('newsletter')}</strong>
            <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 12 }}>{t('newsletterHelp')}</span>
          </span>
        </label>
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          style={{ minHeight: 44, padding: '0 20px', background: 'var(--lime)', color: 'var(--on-lime)', border: 'none', borderRadius: 'var(--pill)', fontWeight: 700, cursor: 'pointer' }}
        >
          {save.isPending ? '…' : t('save')}
        </button>
      </div>
    </section>
  );
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 20,
  boxShadow: 'var(--shadow-sm)',
};
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-2)' };
const input: React.CSSProperties = {
  minHeight: 44,
  padding: '0 10px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
};
const toggleRow: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' };

/** Level → the AccountSettings key holding its plain-language description. */
const DESC_KEY: Record<PlayerLevel, 'levelBeginnerDesc' | 'levelIntermediateDesc' | 'levelAdvancedDesc'> = {
  beginner: 'levelBeginnerDesc',
  intermediate: 'levelIntermediateDesc',
  advanced: 'levelAdvancedDesc',
};
