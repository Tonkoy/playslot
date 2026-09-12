'use client';

import { useTranslations } from 'next-intl';
import { SLOT_STATES, type SlotState } from '@playslot/contracts';

// Each slot state → design token + a non-color cue (icon), per spec §7/§20.
const STATE_STYLE: Record<SlotState, { bg: string; fg: string; icon: string }> = {
  FREE: { bg: 'var(--free-soft)', fg: 'var(--free)', icon: '✓' },
  RESERVED: { bg: 'var(--reserved-soft)', fg: 'var(--reserved)', icon: '×' },
  MINE: { bg: 'var(--teal-soft)', fg: 'var(--teal)', icon: '★' },
  UNAVAILABLE: { bg: 'var(--booked-soft)', fg: 'var(--ink-3)', icon: '–' },
  PAST: { bg: 'var(--booked-soft)', fg: 'var(--ink-3)', icon: '·' },
  EVENT: { bg: 'var(--event-soft)', fg: 'var(--event)', icon: '◆' },
  TOURNAMENT: { bg: 'var(--event-soft)', fg: 'var(--event)', icon: '⚑' },
};

/** Compact legend of the slot-state colours/icons, shown above a schedule grid. */
export function SlotLegend() {
  const st = useTranslations('SlotStates');
  const t = useTranslations('Legend');

  return (
    <section style={{ margin: '4px 0 14px' }}>
      <div className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        {t('title')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {SLOT_STATES.map((state) => {
          const s = STATE_STYLE[state];
          return (
            <span
              key={state}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                background: s.bg,
                border: '1px solid var(--line)',
                borderRadius: 999,
                padding: '5px 11px 5px 7px',
              }}
            >
              <span
                aria-hidden="true"
                className="mono"
                style={{ width: 20, height: 20, display: 'inline-grid', placeItems: 'center', borderRadius: 5, background: 'var(--surface)', color: s.fg, fontWeight: 700, fontSize: 12 }}
              >
                {s.icon}
              </span>
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>{st(state)}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}
