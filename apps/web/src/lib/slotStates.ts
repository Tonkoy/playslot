import type { SlotState } from '@playslot/contracts';

export interface SlotStateStyle {
  /** Filled step: background of a chip/bar, with `--on-state` text on top. */
  solid: string;
  /** Tint: background of a grid cell, with normal ink on top. */
  soft: string;
  /** Text/icon colour used on top of the solid step. */
  onSolid: string;
  /** Non-colour cue — color is never the only signal (spec §7/§20). */
  icon: string;
  /** Recessive states (past / unavailable) stay quiet instead of shouting. */
  recessive: boolean;
  bookable: boolean;
}

/**
 * One source of truth for slot-state colour, shared by the legend and every
 * schedule grid so the two can never drift apart.
 */
export const SLOT_STYLE: Record<SlotState, SlotStateStyle> = {
  FREE: { solid: 'var(--free)', soft: 'var(--free-soft)', onSolid: 'var(--on-state)', icon: '✓', recessive: false, bookable: true },
  RESERVED: { solid: 'var(--reserved)', soft: 'var(--reserved-soft)', onSolid: 'var(--on-state)', icon: '×', recessive: false, bookable: false },
  MINE: { solid: 'var(--mine)', soft: 'var(--mine-soft)', onSolid: 'var(--on-state)', icon: '★', recessive: false, bookable: false },
  UNAVAILABLE: { solid: 'var(--booked)', soft: 'var(--booked-soft)', onSolid: 'var(--on-state)', icon: '–', recessive: true, bookable: false },
  PAST: { solid: 'var(--past)', soft: 'var(--past-soft)', onSolid: 'var(--on-state)', icon: '·', recessive: true, bookable: false },
  EVENT: { solid: 'var(--event)', soft: 'var(--event-soft)', onSolid: 'var(--on-state)', icon: '◆', recessive: false, bookable: false },
  TOURNAMENT: { solid: 'var(--tournament)', soft: 'var(--tournament-soft)', onSolid: 'var(--on-state)', icon: '⚑', recessive: false, bookable: false },
};

/** A solid, filled state tag: coloured background, white icon + label. */
export function stateTagStyle(s: SlotStateStyle): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: s.solid,
    color: s.onSolid,
    borderRadius: 999,
    padding: '2px 9px 2px 7px',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.5,
    whiteSpace: 'nowrap',
  };
}
