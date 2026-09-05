'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { SPORTS } from '@playslot/contracts';
import { Link, useRouter } from '@/i18n/navigation';
import {
  type AdminCourt,
  type CourtInput,
  adminCreateCourt,
  adminListCourts,
  adminSetCourtStatus,
  adminUpdateClubSettings,
  adminUpdateCourt,
  getMe,
  getMyClubs,
} from '@/lib/api';

const SURFACES = ['CLAY', 'HARD', 'GRASS', 'CARPET', 'ARTIFICIAL_GRASS', 'PARQUET', 'OTHER'];
const EMPTY: CourtInput = { name: '', sport: 'TENNIS', surface: 'HARD', isIndoor: false, hasLighting: false };

export function ClubManager({ clubId }: { clubId: number }) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const qc = useQueryClient();

  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  useEffect(() => {
    if (me.isError) router.replace(`/login?returnTo=/admin/clubs/${clubId}`);
  }, [me.isError, router, clubId]);

  const myClubs = useQuery({ queryKey: ['myClubs'], queryFn: getMyClubs, enabled: me.isSuccess });
  const membership = myClubs.data?.find((m) => m.club.id === clubId);

  const courts = useQuery({
    queryKey: ['courts', clubId],
    queryFn: () => adminListCourts(clubId),
    enabled: me.isSuccess,
  });

  const settingsMut = useMutation({
    mutationFn: (slot: number) => adminUpdateClubSettings(clubId, slot),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['myClubs'] });
      qc.invalidateQueries({ queryKey: ['availability', clubId] });
    },
  });

  const createMut = useMutation({
    mutationFn: (input: CourtInput) => adminCreateCourt(clubId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courts', clubId] }),
  });
  const updateMut = useMutation({
    mutationFn: (args: { id: number; input: CourtInput }) =>
      adminUpdateCourt(clubId, args.id, args.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courts', clubId] }),
  });
  const statusMut = useMutation({
    mutationFn: (args: { id: number; status: 'ACTIVE' | 'INACTIVE' }) =>
      adminSetCourtStatus(clubId, args.id, args.status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courts', clubId] }),
  });

  const [draft, setDraft] = useState<CourtInput>(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<CourtInput>(EMPTY);

  if (me.isLoading || me.isError) return <p style={{ color: 'var(--ink-3)' }}>…</p>;
  if (myClubs.isSuccess && !membership)
    return (
      <div style={box}>
        {t('notYourClub')} <Link href="/admin" style={{ color: 'var(--teal)' }}>← {t('back')}</Link>
      </div>
    );

  const club = membership?.club;

  return (
    <div style={{ display: 'grid', gap: 28 }}>
      <Link href="/admin" style={{ color: 'var(--teal)', fontSize: 14 }}>
        ← {t('back')}
      </Link>
      <h1 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800 }}>{club?.name}</h1>

      {/* ── Slot time (club-wide) ── */}
      <section style={card}>
        <h2 style={h2}>{t('slotTimeTitle')}</h2>
        <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '4px 0 14px' }}>
          {t('slotTimeHelp')}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[30, 60].map((v) => {
            const active = (club?.slotIntervalMin ?? 60) === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => settingsMut.mutate(v)}
                disabled={settingsMut.isPending}
                aria-pressed={active}
                style={{
                  minHeight: 44,
                  padding: '0 18px',
                  borderRadius: 'var(--radius-sm)',
                  border: `2px solid ${active ? 'var(--ink)' : 'var(--line-2)'}`,
                  background: active ? 'var(--lime)' : 'var(--surface)',
                  color: active ? 'var(--on-lime)' : 'var(--ink)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {v === 30 ? t('min30') : t('min60')}
              </button>
            );
          })}
        </div>
        {settingsMut.isError && (
          <p style={{ color: 'var(--clay)', fontSize: 13, marginTop: 8 }}>
            {(settingsMut.error as Error).message}
          </p>
        )}
      </section>

      {/* ── Courts ── */}
      <section style={card}>
        <h2 style={h2}>{t('courtsTitle')}</h2>
        <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '4px 0 14px' }}>{t('courtsHelp')}</p>

        {courts.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}
        {courts.isSuccess && (
          <div style={{ display: 'grid', gap: 10 }}>
            {courts.data.map((c) =>
              editingId === c.id ? (
                <CourtFields
                  key={c.id}
                  value={editDraft}
                  onChange={setEditDraft}
                  onSubmit={() => updateMut.mutate({ id: c.id, input: editDraft }, { onSuccess: () => setEditingId(null) })}
                  onCancel={() => setEditingId(null)}
                  submitLabel={t('save')}
                  busy={updateMut.isPending}
                  t={t}
                />
              ) : (
                <CourtRow
                  key={c.id}
                  court={c}
                  onEdit={() => {
                    setEditingId(c.id);
                    setEditDraft({
                      name: c.name,
                      sport: c.sport ?? 'TENNIS',
                      surface: c.surface ?? 'HARD',
                      isIndoor: c.isIndoor ?? false,
                      hasLighting: c.hasLighting ?? false,
                    });
                  }}
                  onToggle={() =>
                    statusMut.mutate({ id: c.id, status: c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
                  }
                  t={t}
                />
              ),
            )}
          </div>
        )}

        <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{t('addCourt')}</h3>
          <CourtFields
            value={draft}
            onChange={setDraft}
            onSubmit={() =>
              createMut.mutate(draft, { onSuccess: () => setDraft(EMPTY) })
            }
            submitLabel={t('add')}
            busy={createMut.isPending}
            t={t}
          />
          {createMut.isError && (
            <p style={{ color: 'var(--clay)', fontSize: 13, marginTop: 8 }}>
              {(createMut.error as Error).message}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function CourtRow({
  court,
  onEdit,
  onToggle,
  t,
}: {
  court: AdminCourt;
  onEdit: () => void;
  onToggle: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const inactive = court.status !== 'ACTIVE';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-sm)',
        padding: '10px 12px',
        opacity: inactive ? 0.55 : 1,
      }}
    >
      <span style={{ fontWeight: 700, minWidth: 120 }}>{court.name}</span>
      <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
        {[court.sport, court.surface, court.isIndoor ? t('indoor') : t('outdoor'), court.hasLighting ? t('lights') : null]
          .filter(Boolean)
          .join(' · ')}
      </span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <button type="button" onClick={onEdit} style={smallBtn}>
          {t('edit')}
        </button>
        <button type="button" onClick={onToggle} style={smallBtn}>
          {inactive ? t('activate') : t('deactivate')}
        </button>
      </span>
    </div>
  );
}

function CourtFields({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
  t,
}: {
  value: CourtInput;
  onChange: (v: CourtInput) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitLabel: string;
  busy: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}
    >
      <label style={fieldLabel}>
        {t('courtName')}
        <input
          required
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          style={fieldInput}
        />
      </label>
      <label style={fieldLabel}>
        {t('sport')}
        <select value={value.sport} onChange={(e) => onChange({ ...value, sport: e.target.value })} style={fieldInput}>
          {SPORTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label style={fieldLabel}>
        {t('surface')}
        <select
          value={value.surface ?? 'HARD'}
          onChange={(e) => onChange({ ...value, surface: e.target.value })}
          style={fieldInput}
        >
          {SURFACES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
        <input
          type="checkbox"
          checked={value.isIndoor ?? false}
          onChange={(e) => onChange({ ...value, isIndoor: e.target.checked })}
        />
        {t('indoor')}
      </label>
      <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
        <input
          type="checkbox"
          checked={value.hasLighting ?? false}
          onChange={(e) => onChange({ ...value, hasLighting: e.target.checked })}
        />
        {t('lights')}
      </label>
      <button
        type="submit"
        disabled={busy}
        style={{ ...smallBtn, background: 'var(--lime)', color: 'var(--on-lime)', border: 'none', fontWeight: 700 }}
      >
        {busy ? '…' : submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} style={smallBtn}>
          {t('cancel')}
        </button>
      )}
    </form>
  );
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 20,
  boxShadow: 'var(--shadow-sm)',
};
const box: React.CSSProperties = { ...card, color: 'var(--ink-2)' };
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700 };
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
const smallBtn: React.CSSProperties = {
  minHeight: 40,
  padding: '0 14px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  fontSize: 14,
};
