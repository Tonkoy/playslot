'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { getMyCoachHours, updateMyCoachHours } from '@/lib/api';
import { hhmmToMin, minToHHMM } from '@/lib/tz';
import { useToast } from './Toast';

const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday … Sunday (weekday numbers, 0=Sun)
type DayState = { working: boolean; startMin: number; endMin: number };

/** Coach edits their own weekly working hours (one interval per day; off = closed). */
export function CoachHoursEditor() {
  const t = useTranslations('CoachHours');
  const tt = useTranslations('Toasts');
  const locale = useLocale();
  const qc = useQueryClient();
  const toast = useToast();

  const hours = useQuery({ queryKey: ['coachHours'], queryFn: getMyCoachHours });
  const [state, setState] = useState<Record<number, DayState>>({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hours.data) return;
    const map: Record<number, DayState> = {};
    for (const w of WEEK) map[w] = { working: false, startMin: 480, endMin: 1080 };
    for (const d of hours.data.days) map[d.weekday] = { working: true, startMin: d.startMin, endMin: d.endMin };
    setState(map);
  }, [hours.data]);

  const save = useMutation({
    mutationFn: () =>
      updateMyCoachHours(
        WEEK.filter((w) => state[w]?.working).map((w) => ({
          weekday: w,
          startMin: state[w]!.startMin,
          endMin: state[w]!.endMin,
        })),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coachHours'] });
      qc.invalidateQueries({ queryKey: ['coachSchedule'] });
      toast(tt('hoursSaved'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  const dfWeekday = new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { weekday: 'long' });
  const weekdayName = (w: number) => dfWeekday.format(new Date(Date.UTC(2024, 0, 7 + w))); // 2024-01-07 = Sun
  const invalid = WEEK.some((w) => state[w]?.working && state[w]!.endMin <= state[w]!.startMin);

  const set = (w: number, patch: Partial<DayState>) =>
    setState((s) => ({ ...s, [w]: { ...s[w]!, ...patch } }));

  return (
    <section style={card}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--ink)',
          textAlign: 'left',
          padding: 0,
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 700 }}>{t('title')}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}>{open ? '▴' : '▾'}</span>
      </button>
      {!open && (
        <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 6 }}>
          {summarize(hours.data?.days ?? [], weekdayName, t)}
        </p>
      )}

      {open && (
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          {WEEK.map((w) => {
            const d = state[w];
            if (!d) return null;
            return (
              <div key={w} style={row}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 150, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={d.working}
                    onChange={(e) => set(w, { working: e.target.checked })}
                  />
                  <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{weekdayName(w)}</span>
                </label>
                {d.working ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="time"
                      value={minToHHMM(d.startMin)}
                      onChange={(e) => set(w, { startMin: hhmmToMin(e.target.value) })}
                      style={timeInput}
                    />
                    <span style={{ color: 'var(--ink-3)' }}>–</span>
                    <input
                      type="time"
                      value={minToHHMM(d.endMin)}
                      onChange={(e) => set(w, { endMin: hhmmToMin(e.target.value) })}
                      style={{ ...timeInput, borderColor: d.endMin <= d.startMin ? 'var(--clay)' : 'var(--line-2)' }}
                    />
                  </div>
                ) : (
                  <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('dayOff')}</span>
                )}
              </div>
            );
          })}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending || invalid}
              style={{
                minHeight: 44,
                padding: '0 20px',
                background: 'var(--lime)',
                color: 'var(--on-lime)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 700,
                cursor: invalid ? 'not-allowed' : 'pointer',
                opacity: invalid ? 0.5 : 1,
              }}
            >
              {save.isPending ? '…' : t('save')}
            </button>
            {invalid && <span style={{ color: 'var(--clay)', fontSize: 13 }}>{t('invalidRange')}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

function summarize(
  days: { weekday: number; startMin: number; endMin: number }[],
  name: (w: number) => string,
  t: ReturnType<typeof useTranslations>,
): string {
  if (days.length === 0) return t('noHours');
  return WEEK.filter((w) => days.some((d) => d.weekday === w))
    .map((w) => {
      const d = days.find((x) => x.weekday === w)!;
      return `${name(w).slice(0, 3)} ${minToHHMM(d.startMin)}–${minToHHMM(d.endMin)}`;
    })
    .join(' · ');
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 18,
  boxShadow: 'var(--shadow-sm)',
};
const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  borderBottom: '1px solid var(--line)',
  paddingBottom: 8,
};
const timeInput: React.CSSProperties = {
  minHeight: 40,
  padding: '0 10px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
};
