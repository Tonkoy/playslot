/**
 * Minimal timezone helpers for the browser (no date-fns on the client). Used to
 * turn a club-local calendar date + minutes-from-midnight into the absolute ISO
 * instant the API expects. The server re-validates alignment, so a DST-edge
 * approximation is rejected rather than mis-booked.
 */

/** Offset (minutes) of `tz` at the given absolute instant. */
function tzOffsetMinutes(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUTC - date.getTime()) / 60_000;
}

/** ISO instant for a wall-clock (isoDate + minutes) in a timezone. */
export function zonedIso(isoDate: string, minutes: number, tz: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  const guessUtc = Date.UTC(y!, m! - 1, d!, h, min);
  const offset = tzOffsetMinutes(tz, new Date(guessUtc));
  return new Date(guessUtc - offset * 60_000).toISOString();
}

/** HH:mm (local wall-clock) from an ISO string that carries its own offset. */
export function localHHMM(iso: string): string {
  return iso.slice(11, 16);
}

export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
}

export function minToHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
