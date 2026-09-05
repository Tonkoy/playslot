import { describe, expect, it } from 'vitest';
import {
  type AvailabilityRuleLike,
  type GenerateSlotsInput,
  type ResourceConfig,
  generateSlots,
} from './availability';
import { instantFromDayMinutes } from './time';

const SOFIA = 'Europe/Sofia';
const LONG_AGO = new Date('2000-01-01T00:00:00Z'); // nothing is PAST

const court: ResourceConfig = {
  id: 706,
  slotIntervalMin: 60,
  minReservationMin: 60,
  allowHalfHour: false,
};

// A weekday window 07:00–22:00. 2026-06-10 is a Wednesday (weekday 3).
const wed = '2026-06-10';
const fullWeek: AvailabilityRuleLike[] = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  startMin: 7 * 60,
  endMin: 22 * 60,
}));

function input(overrides: Partial<GenerateSlotsInput> = {}): GenerateSlotsInput {
  return {
    resource: court,
    rules: fullWeek,
    closures: [],
    occupancy: [],
    isoDate: wed,
    timeZone: SOFIA,
    durationMin: 60,
    now: LONG_AGO,
    ...overrides,
  };
}

describe('generateSlots', () => {
  it('generates hourly slots across the window', () => {
    const slots = generateSlots(input());
    expect(slots).toHaveLength(15); // 07:00 … 21:00 starts (60-min slots ending by 22:00)
    expect(slots.every((s) => s.state === 'FREE')).toBe(true);
    expect(slots[0]!.startMin).toBe(7 * 60);
    expect(slots.at(-1)!.startMin).toBe(21 * 60);
  });

  it('applies the club timezone offset (summer +03:00)', () => {
    const slots = generateSlots(input());
    const sixpm = slots.find((s) => s.startMin === 18 * 60)!;
    expect(sixpm.start.toISOString()).toBe('2026-06-10T15:00:00.000Z');
  });

  it('respects allowHalfHour', () => {
    const half = { ...court, slotIntervalMin: 30, allowHalfHour: true };
    const whole = { ...court, slotIntervalMin: 30, allowHalfHour: false };
    expect(generateSlots(input({ resource: half }))).toHaveLength(29); // every 30 min
    expect(generateSlots(input({ resource: whole }))).toHaveLength(15); // whole hours only
  });

  it('marks slots overlapping occupancy with the occupancy state', () => {
    const start = instantFromDayMinutes(wed, 18 * 60, SOFIA);
    const end = instantFromDayMinutes(wed, 19 * 60, SOFIA);
    const slots = generateSlots(
      input({ occupancy: [{ start, end, state: 'RESERVED' }] }),
    );
    expect(slots.find((s) => s.startMin === 18 * 60)!.state).toBe('RESERVED');
    expect(slots.find((s) => s.startMin === 17 * 60)!.state).toBe('FREE');
  });

  it('passes through MINE / EVENT / TOURNAMENT occupancy states', () => {
    const mk = (h: number) => ({
      start: instantFromDayMinutes(wed, h * 60, SOFIA),
      end: instantFromDayMinutes(wed, (h + 1) * 60, SOFIA),
    });
    const slots = generateSlots(
      input({
        occupancy: [
          { ...mk(8), state: 'MINE' },
          { ...mk(9), state: 'EVENT' },
          { ...mk(10), state: 'TOURNAMENT' },
        ],
      }),
    );
    expect(slots.find((s) => s.startMin === 8 * 60)!.state).toBe('MINE');
    expect(slots.find((s) => s.startMin === 9 * 60)!.state).toBe('EVENT');
    expect(slots.find((s) => s.startMin === 10 * 60)!.state).toBe('TOURNAMENT');
  });

  it('marks closures as UNAVAILABLE', () => {
    const closure = {
      start: instantFromDayMinutes(wed, 12 * 60, SOFIA),
      end: instantFromDayMinutes(wed, 14 * 60, SOFIA),
    };
    const slots = generateSlots(input({ closures: [closure] }));
    expect(slots.find((s) => s.startMin === 12 * 60)!.state).toBe('UNAVAILABLE');
    expect(slots.find((s) => s.startMin === 13 * 60)!.state).toBe('UNAVAILABLE');
    expect(slots.find((s) => s.startMin === 14 * 60)!.state).toBe('FREE');
  });

  it('marks already-started slots as PAST', () => {
    const now = instantFromDayMinutes(wed, 12 * 60 + 30, SOFIA); // 12:30 local
    const slots = generateSlots(input({ now }));
    expect(slots.find((s) => s.startMin === 11 * 60)!.state).toBe('PAST');
    expect(slots.find((s) => s.startMin === 12 * 60)!.state).toBe('PAST');
    expect(slots.find((s) => s.startMin === 13 * 60)!.state).toBe('FREE');
  });

  it('returns no slots on a day without a matching availability rule', () => {
    const mondayOnly: AvailabilityRuleLike[] = [{ weekday: 1, startMin: 420, endMin: 1320 }];
    expect(generateSlots(input({ rules: mondayOnly }))).toHaveLength(0); // wed
  });

  it('produces strictly increasing, unique slot instants across a DST spring-forward day', () => {
    // 2026-03-29 Sofia: 03:00 → 04:00. A 00:00–06:00 window crosses the gap.
    const dstRules: AvailabilityRuleLike[] = [{ weekday: 0, startMin: 0, endMin: 6 * 60 }];
    const slots = generateSlots(
      input({ isoDate: '2026-03-29', rules: dstRules, durationMin: 60 }),
    );
    const times = slots.map((s) => s.start.getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i]!).toBeGreaterThan(times[i - 1]!);
    }
    expect(new Set(times).size).toBe(times.length);
  });
});
