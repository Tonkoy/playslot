'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  cancelGroupSession,
  createGroupSession,
  getCoachAvailability,
  getCoachById,
  getMyGroupSessions,
} from '@/lib/api';
import { formatInstant, localHHMM } from '@/lib/tz';
import { useToast } from './Toast';

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Coach picks a free slot to open a group session, and manages their own. */
export function GroupSessionManager({ coachProfileId }: { coachProfileId: number }) {
  const t = useTranslations('GroupSessions');
  const tt = useTranslations('Toasts');
  const locale = useLocale();
  const qc = useQueryClient();
  const toast = useToast();

  const coach = useQuery({ queryKey: ['coachSelf', coachProfileId], queryFn: () => getCoachById(coachProfileId) });
  const clubs = coach.data?.clubs ?? [];

  const [clubId, setClubId] = useState<number | null>(null);
  const effectiveClub = clubId ?? clubs[0]?.id ?? null;
  const [date, setDate] = useState(tomorrow());
  const [durationMin, setDurationMin] = useState(60);
  const [start, setStart] = useState<string | null>(null);
  const [courtId, setCourtId] = useState<number | null>(null);
  const [capacity, setCapacity] = useState(4);
  const [price, setPrice] = useState(1500);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const avail = useQuery({
    queryKey: ['coachAvail', coachProfileId, effectiveClub, date],
    queryFn: () => getCoachAvailability(coachProfileId, effectiveClub!, date),
    enabled: effectiveClub != null,
  });
  const freeSlots = (avail.data?.slots ?? []).filter((s) => s.state === 'FREE' && s.compatibleCourtIds.length > 0);

  const mine = useQuery({ queryKey: ['myGroupSessions'], queryFn: getMyGroupSessions });

  const create = useMutation({
    mutationFn: () =>
      createGroupSession({
        clubId: effectiveClub!,
        courtId: courtId!,
        startsAt: start!,
        durationMin,
        capacity,
        priceCents: price,
        title,
        description: description || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['myGroupSessions'] });
      qc.invalidateQueries({ queryKey: ['groupSessions'] });
      qc.invalidateQueries({ queryKey: ['coachAvail'] });
      setStart(null);
      setCourtId(null);
      setTitle('');
      setDescription('');
      toast(tt('sessionCreated'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  const cancel = useMutation({
    mutationFn: (id: number) => cancelGroupSession(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['myGroupSessions'] });
      qc.invalidateQueries({ queryKey: ['groupSessions'] });
      toast(tt('sessionCancelled'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  const canCreate = effectiveClub != null && start != null && courtId != null && title.trim().length > 0;

  return (
    <section style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t('createTitle')}</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '4px 0 14px' }}>{t('createHelp')}</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={fieldLabel}>
          {t('club')}
          <select
            value={effectiveClub ?? ''}
            onChange={(e) => {
              setClubId(Number(e.target.value));
              setStart(null);
              setCourtId(null);
            }}
            style={fieldInput}
          >
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label style={fieldLabel}>
          {t('date')}
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setStart(null);
              setCourtId(null);
            }}
            style={fieldInput}
          />
        </label>
        <label style={fieldLabel}>
          {t('duration')}
          <select value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} style={fieldInput}>
            {[60, 90, 120].map((d) => (
              <option key={d} value={d}>{d} {t('min')}</option>
            ))}
          </select>
        </label>
      </div>

      {/* free start times */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 6 }}>{t('pickSlot')}</div>
        {avail.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}
        {avail.isSuccess && freeSlots.length === 0 && (
          <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('noSlots')}</p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {freeSlots.map((s) => {
            const active = start === s.start;
            return (
              <button
                key={s.start}
                type="button"
                onClick={() => {
                  setStart(s.start);
                  setCourtId(s.compatibleCourtIds[0]!);
                }}
                className="mono"
                style={{
                  minHeight: 40,
                  padding: '0 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: `2px solid ${active ? 'var(--ink)' : 'var(--line-2)'}`,
                  background: active ? 'var(--lime)' : 'var(--surface)',
                  color: active ? 'var(--on-lime)' : 'var(--ink)',
                  cursor: 'pointer',
                  fontWeight: active ? 700 : 500,
                }}
              >
                {localHHMM(s.start)}
              </button>
            );
          })}
        </div>
      </div>

      {/* details */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginTop: 14 }}>
        <label style={{ ...fieldLabel, flex: 1, minWidth: 200 }}>
          {t('sessionTitle')}
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={fieldInput} />
        </label>
        <label style={fieldLabel}>
          {t('capacity')}
          <input type="number" min={2} max={50} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} style={{ ...fieldInput, width: 90 }} />
        </label>
        <label style={fieldLabel}>
          {t('pricePerPlayer')}
          <input type="number" min={0} step="0.01" value={price / 100} onChange={(e) => setPrice(Math.round(Number(e.target.value) * 100))} style={{ ...fieldInput, width: 110 }} />
        </label>
      </div>
      <label style={{ ...fieldLabel, marginTop: 10 }}>
        {t('sessionDescription')}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...fieldInput, minHeight: 56, padding: '8px 10px', resize: 'vertical' }} />
      </label>

      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={!canCreate || create.isPending}
          style={{ minHeight: 44, padding: '0 20px', background: 'var(--lime)', color: 'var(--on-lime)', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 700, cursor: canCreate ? 'pointer' : 'not-allowed', opacity: canCreate ? 1 : 0.5 }}
        >
          {create.isPending ? '…' : t('createAndInvite')}
        </button>
        <p style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 6 }}>{t('inviteNote')}</p>
      </div>

      {/* own sessions */}
      {(mine.data?.length ?? 0) > 0 && (
        <div style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{t('mine')}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {mine.data!.map((s) => (
              <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', opacity: s.cancelled ? 0.5 : 1 }}>
                <span style={{ fontWeight: 700 }}>{s.title}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  {formatInstant(s.startsAt, avail.data?.timezone ?? 'Europe/Sofia')} · {s.registeredCount}/{s.capacity}
                </span>
                {s.cancelled ? (
                  <span className="mono" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--clay)' }}>{t('cancelledTag')}</span>
                ) : (
                  <button type="button" onClick={() => cancel.mutate(s.id)} disabled={cancel.isPending} style={{ marginLeft: 'auto', minHeight: 36, padding: '0 12px', border: '1px solid var(--clay)', color: 'var(--clay)', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13 }}>
                    {t('cancel')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
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
