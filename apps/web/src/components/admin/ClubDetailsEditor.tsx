'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ClubPublic } from '@/lib/api';
import { adminUpdateClubProfile } from '@/lib/api';
import { useToast } from '../Toast';

/** Club-admin editor for the public club profile (name, contact, photo, about, rules). */
export function ClubDetailsEditor({ clubId, club }: { clubId: number; club: ClubPublic }) {
  const t = useTranslations('ClubAdmin');
  const tt = useTranslations('Toasts');
  const qc = useQueryClient();
  const toast = useToast();

  const [name, setName] = useState(club.name);
  const [address, setAddress] = useState(club.address);
  const [phone, setPhone] = useState(club.phone ?? '');
  const [photoUrl, setPhotoUrl] = useState(club.photoUrl ?? '');
  const [description, setDescription] = useState(club.description ?? '');
  const [rules, setRules] = useState(club.rules ?? '');

  const save = useMutation({
    mutationFn: () =>
      adminUpdateClubProfile(clubId, {
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim(),
        photoUrl: photoUrl.trim(),
        description: description.trim(),
        rules: rules.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['myClubs'] });
      toast(tt('clubSaved'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  return (
    <section style={card}>
      <h2 style={h2}>{t('detailsTitle')}</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '4px 0 14px' }}>{t('detailsHelp')}</p>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <ClubLogo name={name} photoUrl={photoUrl} />
        <label style={{ ...field, flex: 1, minWidth: 220 }}>
          {t('photoUrl')}
          <input type="url" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…" style={input} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ ...field, flex: '2 1 220px' }}>
          {t('name')}
          <input value={name} onChange={(e) => setName(e.target.value)} style={input} />
        </label>
        <label style={{ ...field, flex: '1 1 160px' }}>
          {t('phone')}
          <input value={phone} onChange={(e) => setPhone(e.target.value)} style={input} />
        </label>
      </div>

      <label style={{ ...field, marginTop: 10 }}>
        {t('address')}
        <input value={address} onChange={(e) => setAddress(e.target.value)} style={input} />
      </label>

      <label style={{ ...field, marginTop: 10 }}>
        {t('about')}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...input, minHeight: 60, padding: '8px 10px', resize: 'vertical' }} />
      </label>

      <label style={{ ...field, marginTop: 10 }}>
        {t('rules')}
        <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={4} style={{ ...input, minHeight: 96, padding: '8px 10px', resize: 'vertical' }} />
      </label>

      <div style={{ marginTop: 14 }}>
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

function ClubLogo({ name, photoUrl }: { name: string; photoUrl: string }) {
  if (photoUrl) {
    return <img src={photoUrl} alt={name} style={{ width: 72, height: 72, borderRadius: 'var(--radius-sm)', objectFit: 'cover', border: '1px solid var(--line)' }} />;
  }
  return (
    <span style={{ width: 72, height: 72, borderRadius: 'var(--radius-sm)', border: '1px solid var(--line-2)', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontWeight: 800, fontSize: 24, background: 'var(--surface-2)' }}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 20,
  boxShadow: 'var(--shadow-sm)',
};
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700 };
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
