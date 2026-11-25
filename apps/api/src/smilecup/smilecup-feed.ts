/**
 * Smile Cup's public feed of upcoming amateur tournaments
 * (https://smilecup.bg/api/public/tournaments/upcoming/). Read-only, no key.
 * The feed is someone else's data: every field is checked before use.
 */

// Keep the trailing slash: without it their site answers with a redirect.
const FEED_URL = process.env.SMILECUP_FEED_URL ?? 'https://smilecup.bg/api/public/tournaments/upcoming/';
const TIMEOUT_MS = 8000;

export interface SmileCupTournament {
  id: string;
  name: string;
  url: string | null;
  /** Calendar day in Sofia, YYYY-MM-DD. */
  day: string;
  levelName: string | null;
  gender: string | null;
  discipline: string | null;
  venue: string | null;
  city: string | null;
  isFull: boolean;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function safeUrl(raw: unknown): string | null {
  const value = str(raw);
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)smilecup\.bg$/.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function parse(row: unknown): SmileCupTournament | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const id = str(r.id);
  const name = str(r.name);
  const day = str(r.day);
  if (!id || !name || !day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return {
    id,
    name,
    url: safeUrl(r.url),
    day,
    levelName: str(r.levelName),
    gender: str(r.gender),
    discipline: str(r.discipline),
    venue: str(r.venue),
    city: str(r.city),
    isFull: r.isFull === true,
  };
}

/** Upcoming tournaments, soonest first. Throws when the feed cannot be read. */
export async function fetchSmileCupTournaments(): Promise<SmileCupTournament[]> {
  const res = await fetch(FEED_URL, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Smile Cup feed answered ${res.status}`);
  const body = (await res.json()) as { data?: unknown } | null;
  if (!body || !Array.isArray(body.data)) throw new Error('Smile Cup feed: unexpected shape');
  return body.data.map(parse).filter((t): t is SmileCupTournament => t !== null);
}

/** Words that say nothing about which club it is. */
const GENERIC = new Set([
  'тенис', 'клуб', 'софийски', 'софия', 'корт', 'кортове', 'спортен', 'център', 'на', 'и',
  'tennis', 'club', 'sofia', 'court', 'courts', 'center', 'centre', 'the', 'and', 'tc',
]);
const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(' ')
      .filter((w) => w && !GENERIC.has(w)),
  );

/**
 * Whether a tournament's venue is this club: they share a distinctive word
 * ("Софийски тенис клуб 360" ↔ "360 Тенис клуб" share "360"). Only a hint for
 * the list — the admin still decides what to block.
 */
export function venueMatchesClub(venue: string | null, clubName: string): boolean {
  if (!venue) return false;
  const club = tokens(clubName);
  for (const w of tokens(venue)) if (club.has(w)) return true;
  return false;
}
