'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { PlatformClubDto } from '@playslot/contracts';
import {
  platformAddAdmin,
  platformCreateClub,
  platformListClubs,
  platformSetClubStatus,
} from '@/lib/api';
import { AddMemberForm } from './AddMemberForm';

/** Super-admin console: all clubs, create a club, assign club admins. */
export function PlatformConsole() {
  const t = useTranslations('Platform');
  const qc = useQueryClient();
  const clubs = useQuery({ queryKey: ['platformClubs'], queryFn: platformListClubs });

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [slot, setSlot] = useState<30 | 60>(60);
  const [expanded, setExpanded] = useState<number | null>(null);

  const create = useMutation({
    mutationFn: () =>
      platformCreateClub({ name, city, slotIntervalMin: slot, timezone: 'Europe/Sofia', currency: 'EUR' }),
    onSuccess: () => {
      setName('');
      setCity('');
      qc.invalidateQueries({ queryKey: ['platformClubs'] });
    },
  });
  const status = useMutation({
    mutationFn: (args: { id: number; active: boolean }) => platformSetClubStatus(args.id, args.active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platformClubs'] }),
  });

  return (
    <section style={{ ...card, marginBottom: 28, borderColor: 'var(--teal)' }}>
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>{t('title')}</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '4px 0 16px' }}>{t('subtitle')}</p>

      {/* create a club */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', paddingBottom: 16, borderBottom: '1px solid var(--line)' }}
      >
        <label style={fieldLabel}>
          {t('clubName')}
          <input required value={name} onChange={(e) => setName(e.target.value)} style={{ ...fieldInput, minWidth: 200 }} />
        </label>
        <label style={fieldLabel}>
          {t('city')}
          <input required value={city} onChange={(e) => setCity(e.target.value)} style={fieldInput} />
        </label>
        <label style={fieldLabel}>
          {t('slot')}
          <select value={slot} onChange={(e) => setSlot(Number(e.target.value) as 30 | 60)} style={fieldInput}>
            <option value={60}>60 {t('min')}</option>
            <option value={30}>30 {t('min')}</option>
          </select>
        </label>
        <button type="submit" disabled={create.isPending} style={primaryBtn}>
          {create.isPending ? '…' : t('createClub')}
        </button>
      </form>
      {create.isError && <p style={{ color: 'var(--clay)', fontSize: 13, marginTop: 8 }}>{(create.error as Error).message}</p>}

      {/* all clubs */}
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: '18px 0 10px' }}>{t('allClubs')}</h3>
      {clubs.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {clubs.data?.map((c) => (
          <ClubRow
            key={c.id}
            c={c}
            expanded={expanded === c.id}
            onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
            onStatus={(active) => status.mutate({ id: c.id, active })}
            onAdminAdded={() => qc.invalidateQueries({ queryKey: ['platformClubs'] })}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}

function ClubRow({
  c,
  expanded,
  onToggle,
  onStatus,
  onAdminAdded,
  t,
}: {
  c: PlatformClubDto;
  expanded: boolean;
  onToggle: () => void;
  onStatus: (active: boolean) => void;
  onAdminAdded: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const active = c.status === 'ACTIVE';
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700 }}>{c.name}</span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          {c.city} · {c.status} · {t('adminsCount', { n: c.adminCount })} · {t('coachesCount', { n: c.coachCount })}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => onStatus(!active)} style={smallBtn}>
            {active ? t('suspend') : t('activate')}
          </button>
          <button type="button" onClick={onToggle} style={smallBtn}>
            {t('addAdmin')}
          </button>
        </span>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <AddMemberForm
            onSubmit={(input) => platformAddAdmin(c.id, input)}
            submitLabel={t('addAdmin')}
            onDone={onAdminAdded}
          />
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 20,
  boxShadow: 'var(--shadow-sm)',
};
const fieldLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-2)' };
const fieldInput: React.CSSProperties = {
  minHeight: 44,
  padding: '0 10px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
};
const primaryBtn: React.CSSProperties = {
  minHeight: 44,
  padding: '0 18px',
  background: 'var(--lime)',
  color: 'var(--on-lime)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 700,
  cursor: 'pointer',
};
const smallBtn: React.CSSProperties = {
  minHeight: 36,
  padding: '0 12px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  fontSize: 13,
};
