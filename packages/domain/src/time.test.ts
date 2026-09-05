import { describe, expect, it } from 'vitest';
import {
  formatInZone,
  instantFromDayMinutes,
  intervalsOverlap,
  minutesBetween,
  zonedTimeToUtc,
} from './time';

const SOFIA = 'Europe/Sofia';

describe('timezone conversion (Europe/Sofia, DST-aware)', () => {
  it('applies the winter offset (+02:00)', () => {
    // 18:00 local on a January day → 16:00 UTC
    const utc = zonedTimeToUtc('2026-01-15T18:00:00', SOFIA);
    expect(utc.toISOString()).toBe('2026-01-15T16:00:00.000Z');
  });

  it('applies the summer offset (+03:00)', () => {
    // 18:00 local on a July day → 15:00 UTC
    const utc = zonedTimeToUtc('2026-07-15T18:00:00', SOFIA);
    expect(utc.toISOString()).toBe('2026-07-15T15:00:00.000Z');
  });

  it('formats an instant back into the club timezone with the right offset', () => {
    const winter = zonedTimeToUtc('2026-01-15T18:00:00', SOFIA);
    expect(formatInZone(winter, SOFIA)).toBe('2026-01-15T18:00:00+02:00');
    const summer = zonedTimeToUtc('2026-07-15T18:00:00', SOFIA);
    expect(formatInZone(summer, SOFIA)).toBe('2026-07-15T18:00:00+03:00');
  });
});

describe('instantFromDayMinutes (availability rule resolution)', () => {
  it('resolves minutes-from-midnight to a UTC instant in winter', () => {
    // 18:00 = 1080 minutes
    const utc = instantFromDayMinutes('2026-01-15', 1080, SOFIA);
    expect(utc.toISOString()).toBe('2026-01-15T16:00:00.000Z');
  });

  it('resolves minutes-from-midnight to a UTC instant in summer', () => {
    const utc = instantFromDayMinutes('2026-07-15', 1080, SOFIA);
    expect(utc.toISOString()).toBe('2026-07-15T15:00:00.000Z');
  });

  it('handles end-of-day (1440) as next-day midnight', () => {
    const utc = instantFromDayMinutes('2026-07-15', 1440, SOFIA);
    // 2026-07-16 00:00 local (+03) → 2026-07-15 21:00 UTC
    expect(utc.toISOString()).toBe('2026-07-15T21:00:00.000Z');
  });
});

describe('DST transitions', () => {
  it('spring-forward day is one hour shorter (Sofia, 2026-03-29)', () => {
    // Clocks jump 03:00 → 04:00. Midnight → noon is 11 real hours, not 12.
    const start = instantFromDayMinutes('2026-03-29', 0, SOFIA);
    const noon = instantFromDayMinutes('2026-03-29', 720, SOFIA);
    expect(minutesBetween(start, noon)).toBe(11 * 60);
  });

  it('fall-back day is one hour longer (Sofia, 2026-10-25)', () => {
    // Clocks fall 04:00 → 03:00. Midnight → noon is 13 real hours.
    const start = instantFromDayMinutes('2026-10-25', 0, SOFIA);
    const noon = instantFromDayMinutes('2026-10-25', 720, SOFIA);
    expect(minutesBetween(start, noon)).toBe(13 * 60);
  });
});

describe('intervalsOverlap (half-open)', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 0, 1, h));

  it('detects overlap', () => {
    expect(intervalsOverlap({ start: at(10), end: at(12) }, { start: at(11), end: at(13) })).toBe(
      true,
    );
  });

  it('treats touching intervals as non-overlapping', () => {
    expect(intervalsOverlap({ start: at(10), end: at(12) }, { start: at(12), end: at(14) })).toBe(
      false,
    );
  });
});
