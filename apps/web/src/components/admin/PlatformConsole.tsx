'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { PlatformClubDto } from '@playslot/contracts';
import { Link } from '@/i18n/navigation';
import {
  getCities,
  platformAddAdmin,
  platformCreateCity,
  platformCreateClub,
  platformListClubs,
  platformSetClubStatus,
  platformSetFeatured,
} from '@/lib/api';
import { enumLabel } from '@/lib/enums';
import { AddMemberForm } from './AddMemberForm';
import { SkeletonRows } from '@/components/Skeleton';

/** Super-admin console: all clubs, create a club, assign club admins. */
export function PlatformConsole() {
  const t = useTranslations('Platform');
  const qc = useQueryClient();
  const clubs = useQuery({ queryKey: ['platformClubs'], queryFn: platformListClubs });

  const [name, setName] = useState('');
  // A club is filed under an existing city: free text is how "София" and
  // "Sofia" became two cities and the default search found neither (QA-02).
  const [cityId, setCityId] = useState<number | ''>('');
  const [newCity, setNewCity] = useState('');
  const [addingCity, setAddingCity] = useState(false);
  const [slot, setSlot] = useState<30 | 60>(60);
  const [expanded, setExpanded] = useState<number | null>(null);

  const cities = useQuery({ queryKey: ['cities', 'all'], queryFn: () => getCities(true) });

  const create = useMutation({
    mutationFn: () =>
      platformCreateClub({
        name,
        cityId: Number(cityId),
        slotIntervalMin: slot,
        timezone: 'Europe/Sofia',
        currency: 'EUR',
      }),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['platformClubs'] });
    },
  });

  const addCity = useMutation({
    mutationFn: () => platformCreateCity(newCity.trim()),
    onSuccess: (c) => {
      setNewCity('');
      setAddingCity(false);
      setCityId(c.id);
      qc.invalidateQueries({ queryKey: ['cities'] });
    },
  });
  const status = useMutation({
    mutationFn: (args: { id: number; active: boolean }) => platformSetClubStatus(args.id, args.active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platformClubs'] }),
  });
  const featureMut = useMutation({
    mutationFn: (args: { id: number; featured: boolean }) => platformSetFeatured(args.id, args.featured),
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
          <select
            required
            value={cityId}
            onChange={(e) => setCityId(e.target.value ? Number(e.target.value) : '')}
            style={{ ...fieldInput, minWidth: 160 }}
          >
            <option value="">{t('cityPlaceholder')}</option>
            {cities.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {addingCity ? (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'end' }}>
            <label style={fieldLabel}>
              {t('newCity')}
              <input
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
                placeholder={t('newCityPlaceholder')}
                style={fieldInput}
              />
            </label>
            <button
              type="button"
              onClick={() => addCity.mutate()}
              disabled={newCity.trim().length < 2 || addCity.isPending}
              style={smallBtn}
            >
              {addCity.isPending ? '…' : t('saveCity')}
            </button>
            <button type="button" onClick={() => setAddingCity(false)} style={smallBtn}>
              {t('cancel')}
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setAddingCity(true)} style={smallBtn}>
            + {t('addCity')}
          </button>
        )}
        <label style={fieldLabel}>
          {t('slot')}
          <select value={slot} onChange={(e) => setSlot(Number(e.target.value) as 30 | 60)} style={fieldInput}>
            <option value={60}>60 {t('min')}</option>
            <option value={30}>30 {t('min')}</option>
          </select>
        </label>
        <button type="submit" disabled={create.isPending || cityId === ''} style={primaryBtn}>
          {create.isPending ? '…' : t('createClub')}
        </button>
      </form>
      {create.isError && <p style={{ color: 'var(--clay)', fontSize: 13, marginTop: 8 }}>{(create.error as Error).message}</p>}
      {addCity.isError && <p style={{ color: 'var(--clay)', fontSize: 13, marginTop: 8 }}>{(addCity.error as Error).message}</p>}

      {/* all clubs */}
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: '18px 0 10px' }}>{t('allClubs')}</h3>
      {clubs.isLoading && <SkeletonRows />}
      <div style={{ display: 'grid', gap: 10 }}>
        {clubs.data?.map((c) => (
          <ClubRow
            key={c.id}
            c={c}
            expanded={expanded === c.id}
            onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
            onStatus={(active) => status.mutate({ id: c.id, active })}
            onFeature={(featured) => featureMut.mutate({ id: c.id, featured })}
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
  onFeature,
  onAdminAdded,
  t,
}: {
  c: PlatformClubDto;
  expanded: boolean;
  onToggle: () => void;
  onStatus: (active: boolean) => void;
  onFeature: (featured: boolean) => void;
  onAdminAdded: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const te = useTranslations('Enums');
  const active = c.status === 'ACTIVE';
  return (
    <div
      style={{
        border: `1px solid ${c.isFeatured ? 'var(--lime)' : 'var(--line)'}`,
        borderRadius: 'var(--radius-sm)',
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700 }}>{c.name}</span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          {c.city} · {enumLabel(te, 'ClubStatus', c.status)} · {t('adminsCount', { n: c.adminCount })} ·{' '}
          {t('coachesCount', { n: c.coachCount })}
        </span>
        {c.isFeatured && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: 'var(--pill)',
              background: 'var(--lime)',
              color: 'var(--on-lime)',
            }}
          >
            ★ {t('featuredBadge')}
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href={`/admin/clubs/${c.id}`} style={{ ...smallBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', color: 'var(--teal)', borderColor: 'var(--teal)' }}>
            {t('manage')}
          </Link>
          <button type="button" onClick={() => onFeature(!c.isFeatured)} style={smallBtn}>
            {c.isFeatured ? t('unfeature') : t('featureOnHome')}
          </button>
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
  borderRadius: 'var(--pill)',
  fontWeight: 700,
  cursor: 'pointer',
};
const smallBtn: React.CSSProperties = {
  minHeight: 36,
  padding: '0 12px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--green-deep)',
  borderRadius: 'var(--pill)',
  cursor: 'pointer',
  fontSize: 13,
};
