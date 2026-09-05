import { getTimezoneOffset } from 'date-fns-tz';
import { formatInZone, instantFromDayMinutes, intervalsOverlap } from './time';

/**
 * Availability engine (spec §7). Pure and framework-free: it *computes* bookable
 * slots on read from rules minus occupancy — slots are never stored rows. Times
 * are resolved through the club timezone so results are correct across DST.
 *
 * Bookable inventory =
 *     operating hours ∩ resource availability rules
 *   − occupancy (CONFIRMED / PENDING_PAYMENT / active HOLD / EVENT / TOURNAMENT)
 *   − closures/maintenance exceptions
 *   − slots that don't fit the requested duration / interval rules
 */

export type SlotState =
  | 'FREE'
  | 'RESERVED'
  | 'MINE'
  | 'UNAVAILABLE'
  | 'PAST'
  | 'EVENT'
  | 'TOURNAMENT';

export type OccupancyState = 'RESERVED' | 'MINE' | 'EVENT' | 'TOURNAMENT';

export interface Occupancy {
  start: Date;
  end: Date;
  state: OccupancyState;
}

export interface Closure {
  start: Date;
  end: Date;
}

export interface AvailabilityRuleLike {
  weekday: number; // 0=Sun … 6=Sat
  startMin: number; // minutes from local midnight
  endMin: number;
}

export interface ResourceConfig {
  id: number;
  slotIntervalMin: number;
  minReservationMin: number;
  allowHalfHour: boolean;
}

export interface GenerateSlotsInput {
  resource: ResourceConfig;
  rules: AvailabilityRuleLike[];
  closures: Closure[];
  occupancy: Occupancy[];
  isoDate: string; // YYYY-MM-DD in the club timezone
  timeZone: string;
  durationMin: number;
  now: Date;
}

export interface Slot {
  resourceId: number;
  startMin: number; // minutes from local midnight
  start: Date; // UTC instant
  end: Date; // UTC instant
  state: SlotState;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Weekday (0=Sun…6=Sat) of a local calendar date in a timezone. */
export function weekdayInZone(isoDate: string, timeZone: string): number {
  // Anchor at local noon to avoid any midnight/DST edge ambiguity for the day-of-week.
  const noonUtc = instantFromDayMinutes(isoDate, 12 * 60, timeZone);
  const offsetMs = getTimezoneOffset(timeZone, noonUtc);
  const local = new Date(noonUtc.getTime() + offsetMs);
  return local.getUTCDay();
}

function classify(
  start: Date,
  end: Date,
  now: Date,
  closures: Closure[],
  occupancy: Occupancy[],
): SlotState {
  if (start.getTime() <= now.getTime()) return 'PAST';
  const slot = { start, end };
  if (closures.some((c) => intervalsOverlap(slot, c))) return 'UNAVAILABLE';
  const hit = occupancy.find((o) => intervalsOverlap(slot, o));
  return hit ? hit.state : 'FREE';
}

export function generateSlots(input: GenerateSlotsInput): Slot[] {
  const { resource, rules, closures, occupancy, isoDate, timeZone, durationMin, now } = input;

  if (durationMin <= 0) return [];
  const weekday = weekdayInZone(isoDate, timeZone);
  const step = resource.slotIntervalMin > 0 ? resource.slotIntervalMin : 30;

  const windows = rules.filter((r) => r.weekday === weekday && r.endMin > r.startMin);
  const slots: Slot[] = [];
  const seen = new Set<number>();

  for (const window of windows) {
    for (let m = window.startMin; m + durationMin <= window.endMin; m += step) {
      // Interval-rule: when half-hour starts aren't allowed, only whole hours.
      if (!resource.allowHalfHour && m % 60 !== 0) continue;
      if (seen.has(m)) continue;
      seen.add(m);

      const start = instantFromDayMinutes(isoDate, m, timeZone);
      // Skip local times that don't exist (DST spring-forward gap): the instant
      // wouldn't round-trip back to the intended wall-clock minute, so booking it
      // would be ambiguous. This also prevents duplicate instants on that day.
      const expected = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      if (formatInZone(start, timeZone, 'HH:mm') !== expected) continue;

      const end = instantFromDayMinutes(isoDate, m + durationMin, timeZone);
      slots.push({
        resourceId: resource.id,
        startMin: m,
        start,
        end,
        state: classify(start, end, now, closures, occupancy),
      });
    }
  }

  slots.sort((a, b) => a.startMin - b.startMin);
  return slots;
}
