import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';

/**
 * Time discipline (golden rule §2.5): store UTC, compute/display in the club's
 * IANA timezone. All conversions go through these helpers — never raw Date math.
 * The anchor market is Europe/Sofia (EET/EEST), which observes DST, so these are
 * covered by DST-transition tests.
 */

export type IanaTimeZone = string; // e.g. "Europe/Sofia"

/**
 * Convert a wall-clock local time in a given zone to the absolute UTC instant.
 * `localWallClock` is a naive local time expressed as either a "YYYY-MM-DDTHH:mm"
 * string or a Date whose fields are interpreted in `timeZone`.
 */
export function zonedTimeToUtc(localWallClock: string | Date, timeZone: IanaTimeZone): Date {
  return fromZonedTime(localWallClock, timeZone);
}

/** Convert an absolute UTC instant to the equivalent wall-clock Date in a zone. */
export function utcToZonedTime(instant: Date, timeZone: IanaTimeZone): Date {
  return toZonedTime(instant, timeZone);
}

/** Format an absolute instant in a club's timezone. Default: ISO with offset. */
export function formatInZone(
  instant: Date,
  timeZone: IanaTimeZone,
  pattern = "yyyy-MM-dd'T'HH:mm:ssXXX",
): string {
  return formatInTimeZone(instant, timeZone, pattern);
}

/**
 * Build the absolute UTC instant for a given calendar date + minutes-from-midnight
 * in a club's timezone. Availability rules store `startMin`/`endMin` as minutes
 * from local midnight (spec §5); this resolves them against a real date, correctly
 * across DST boundaries.
 */
export function instantFromDayMinutes(
  isoDate: string, // "YYYY-MM-DD" local calendar date in the club's zone
  minutesFromMidnight: number,
  timeZone: IanaTimeZone,
): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new RangeError(`isoDate must be YYYY-MM-DD, got "${isoDate}"`);
  }
  if (minutesFromMidnight < 0 || minutesFromMidnight > 24 * 60) {
    throw new RangeError(`minutesFromMidnight out of range: ${minutesFromMidnight}`);
  }
  const hh = String(Math.floor(minutesFromMidnight / 60)).padStart(2, '0');
  const mm = String(minutesFromMidnight % 60).padStart(2, '0');
  // 24:00 is not a valid wall-clock string; represent end-of-day as next-day 00:00.
  if (minutesFromMidnight === 24 * 60) {
    const next = new Date(`${isoDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const nextIso = next.toISOString().slice(0, 10);
    return fromZonedTime(`${nextIso}T00:00:00`, timeZone);
  }
  return fromZonedTime(`${isoDate}T${hh}:${mm}:00`, timeZone);
}

/** Minutes between two instants (b − a). Both are absolute; result is DST-safe. */
export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

export interface Interval {
  readonly start: Date;
  readonly end: Date;
}

/** Half-open overlap test: [aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅. */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}
