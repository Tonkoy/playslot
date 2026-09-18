'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { UpsertEventInput } from '@playslot/contracts';
import { adminCreateEvent, listEvents } from '@/lib/api';
import { formatInstant, zonedIso } from '@/lib/tz';

type EventDraft = {
  type: 'EVENT' | 'TOURNAMENT';
  title: string;
  description: string;
  startsLocal: string; // datetime-local value, interpreted in the club timezone
  endsLocal: string;
  capacity: number;
  feeCents: number;
};
const EMPTY: EventDraft = {
  type: 'EVENT',
  title: '',
  description: '',
  startsLocal: '',
  endsLocal: '',
  capacity: 16,
  feeCents: 0,
};

/** datetime-local ("YYYY-MM-DDTHH:mm") → absolute ISO in the club timezone. */
function localToIso(value: string, tz: string): string {
  const [date, time] = value.split('T');
  const [h, m] = (time ?? '00:00').split(':').map(Number);
  return zonedIso(date!, (h ?? 0) * 60 + (m ?? 0), tz);
}

/** Club-admin creation of events & tournaments (spec §22 M9). */
export function EventManager({
  clubId,
  timezone,
  currency,
}: {
  clubId: number;
  timezone: string;
  currency: string;
}) {
  const t = useTranslations('Admin');
  const qc = useQueryClient();

  const events = useQuery({ queryKey: ['adminEvents', clubId], queryFn: () => listEvents(clubId) });

  const createMut = useMutation({
    mutationFn: (input: UpsertEventInput) => adminCreateEvent(clubId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminEvents', clubId] });
      qc.invalidateQueries({ queryKey: ['events', clubId] });
    },
  });

  const [draft, setDraft] = useState<EventDraft>(EMPTY);

  const submit = () => {
    createMut.mutate(
      {
        type: draft.type,
        title: draft.title,
        description: draft.description || undefined,
        startsAt: localToIso(draft.startsLocal, timezone),
        endsAt: localToIso(draft.endsLocal, timezone),
        capacity: draft.capacity,
        feeCents: draft.feeCents,
      },
      { onSuccess: () => setDraft(EMPTY) },
    );
  };

  return (
    <section style={card}>
      <h2 style={h2}>{t('eventsTitle')}</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '4px 0 14px' }}>{t('eventsHelp')}</p>

      {events.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}
      {events.isSuccess && (
        <div style={{ display: 'grid', gap: 10 }}>
          {events.data.length === 0 && (
            <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('noEvents')}</p>
          )}
          {events.data.map((e) => (
            <div key={e.id} style={row}>
              <span style={{ fontWeight: 700 }}>{e.title}</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {e.type === 'TOURNAMENT' ? t('tournament') : t('event')} ·{' '}
                {formatInstant(e.startsAt, timezone)} · {e.registeredCount}/{e.capacity}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        <h3 style={h3}>{t('addEvent')}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          style={{ display: 'grid', gap: 8 }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={fieldLabel}>
              {t('eventType')}
              <select
                value={draft.type}
                onChange={(ev) => setDraft({ ...draft, type: ev.target.value as EventDraft['type'] })}
                style={fieldInput}
              >
                <option value="EVENT">{t('event')}</option>
                <option value="TOURNAMENT">{t('tournament')}</option>
              </select>
            </label>
            <label style={{ ...fieldLabel, flex: 1, minWidth: 200 }}>
              {t('eventTitle')}
              <input
                required
                value={draft.title}
                onChange={(ev) => setDraft({ ...draft, title: ev.target.value })}
                style={fieldInput}
              />
            </label>
          </div>
          <label style={fieldLabel}>
            {t('eventDescription')}
            <textarea
              value={draft.description}
              onChange={(ev) => setDraft({ ...draft, description: ev.target.value })}
              rows={2}
              style={{ ...fieldInput, minHeight: 60, padding: '8px 10px', resize: 'vertical' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={fieldLabel}>
              {t('startsAt')}
              <input
                required
                type="datetime-local"
                value={draft.startsLocal}
                onChange={(ev) => setDraft({ ...draft, startsLocal: ev.target.value })}
                style={fieldInput}
              />
            </label>
            <label style={fieldLabel}>
              {t('endsAt')}
              <input
                required
                type="datetime-local"
                value={draft.endsLocal}
                onChange={(ev) => setDraft({ ...draft, endsLocal: ev.target.value })}
                style={fieldInput}
              />
            </label>
            <label style={fieldLabel}>
              {t('capacity')}
              <input
                type="number"
                min={1}
                value={draft.capacity}
                onChange={(ev) => setDraft({ ...draft, capacity: Number(ev.target.value) })}
                style={{ ...fieldInput, width: 90 }}
              />
            </label>
            <label style={fieldLabel}>
              {t('feeLabel', { currency })}
              <input
                type="number"
                min={0}
                step="0.01"
                value={draft.feeCents / 100}
                onChange={(ev) => setDraft({ ...draft, feeCents: Math.round(Number(ev.target.value) * 100) })}
                style={{ ...fieldInput, width: 110 }}
              />
            </label>
            <button type="submit" disabled={createMut.isPending} style={primaryBtn}>
              {createMut.isPending ? '…' : t('add')}
            </button>
          </div>
        </form>
        {createMut.isError && (
          <p style={{ color: 'var(--clay)', fontSize: 13, marginTop: 8 }}>
            {(createMut.error as Error).message}
          </p>
        )}
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
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700 };
const h3: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 10 };
const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  padding: '10px 12px',
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
const primaryBtn: React.CSSProperties = {
  minHeight: 44,
  padding: '0 18px',
  background: 'var(--lime)',
  color: 'var(--on-lime)',
  border: 'none',
  borderRadius: 'var(--pill)',
  cursor: 'pointer',
  fontWeight: 700,
};
