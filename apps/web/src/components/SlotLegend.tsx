'use client';

import { useTranslations } from 'next-intl';
import { SLOT_STATES } from '@playslot/contracts';
import { SLOT_STYLE } from '@/lib/slotStates';

/** Compact legend of the slot-state colours/icons, shown above a schedule grid. */
export function SlotLegend() {
  const st = useTranslations('SlotStates');
  const t = useTranslations('Legend');

  return (
    <section style={{ margin: '4px 0 14px' }}>
      <div
        className="mono"
        style={{ fontSize: 12, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}
      >
        {t('title')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {SLOT_STATES.map((state) => {
          const s = SLOT_STYLE[state];
          return (
            <span
              key={state}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                // Solid fill: the state's own colour carries the chip.
                background: s.solid,
                color: 'var(--on-state)',
                border: '1px solid transparent',
                borderRadius: 999,
                padding: '5px 12px 5px 6px',
              }}
            >
              <span
                aria-hidden="true"
                className="mono"
                style={{
                  width: 20,
                  height: 20,
                  display: 'inline-grid',
                  placeItems: 'center',
                  borderRadius: 999,
                  // A translucent white disc keeps the icon legible on any step.
                  background: 'rgba(255, 255, 255, 0.22)',
                  color: 'var(--on-state)',
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                {s.icon}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{st(state)}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}
