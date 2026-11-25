/**
 * Smile Cup's public feed of upcoming amateur tournaments (smilecup.bg).
 * PlaySlot only lists them; registration happens on Smile Cup, so every card
 * links out to the tournament's own page.
 *
 * Read on the server: one cached copy serves everybody (the feed itself is
 * cached for 5 minutes on their side, so asking more often gains nothing), the
 * list is in the HTML for search engines, and a slow or failing Smile Cup can
 * never hang a visitor's browser.
 */

// Keep the trailing slash: without it their site answers with a redirect.
const FEED_URL = 'https://smilecup.bg/api/public/tournaments/upcoming/';
const REVALIDATE_SECONDS = 300;
const TIMEOUT_MS = 5000;
const ALLOWED_PAGE_HOSTS = new Set(['smilecup.bg', 'www.smilecup.bg']);

export const SMILECUP_SITE = 'https://smilecup.bg';
/**
 * The feed has no currency field ("as entered by the organiser"). Entry fees
 * are shown in euro, Bulgaria's currency; change this if Smile Cup ever says
 * otherwise or adds the field.
 */
export const SMILECUP_PRICE_CURRENCY = 'EUR';

export const TOURNAMENT_GENDERS = ['f', 'm', 'uni'] as const;
export type TournamentGender = (typeof TOURNAMENT_GENDERS)[number];
export const TOURNAMENT_DISCIPLINES = ['singles', 'doubles', 'mixed_doubles'] as const;
export type TournamentDiscipline = (typeof TOURNAMENT_DISCIPLINES)[number];

export interface Tournament {
  id: string;
  name: string;
  /** Tournament page on smilecup.bg, already tagged as coming from PlaySlot. */
  registerUrl: string;
  /** Calendar day in Sofia, YYYY-MM-DD. */
  day: string;
  levelName: string | null;
  gender: TournamentGender | null;
  discipline: TournamentDiscipline | null;
  matchFormat: string | null;
  price: number | null;
  capacity: number | null;
  registered: number;
  spotsLeft: number | null;
  isFull: boolean;
  registrationOpen: boolean;
  venue: string | null;
  city: string | null;
  image: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  allowed.includes(v as T) ? (v as T) : null;

/** The feed is someone else's data: a link is only used if it is their own https page. */
function registerUrl(raw: unknown): string | null {
  const value = str(raw);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !ALLOWED_PAGE_HOSTS.has(url.hostname)) return null;
    // So Smile Cup can count the sign-ups that came from PlaySlot.
    url.searchParams.set('utm_source', 'playslot');
    url.searchParams.set('utm_medium', 'app');
    url.searchParams.set('utm_campaign', 'tournaments');
    return url.toString();
  } catch {
    return null;
  }
}

function imageUrl(raw: unknown): string | null {
  const value = str(raw);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    // Covers are uploaded full-size; ImageKit resizes on request.
    if (url.hostname === 'ik.imagekit.io' && !url.searchParams.has('tr')) {
      url.searchParams.set('tr', 'w-800');
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** One feed row → a Tournament, or null if it lacks what a card cannot do without. */
function parse(row: unknown): Tournament | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const id = str(r.id);
  const name = str(r.name);
  const url = registerUrl(r.url);
  const day = str(r.day);
  if (!id || !name || !url || !day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return {
    id,
    name,
    registerUrl: url,
    day,
    levelName: str(r.levelName),
    gender: oneOf(r.gender, TOURNAMENT_GENDERS),
    discipline: oneOf(r.discipline, TOURNAMENT_DISCIPLINES),
    matchFormat: str(r.matchFormat),
    price: num(r.price),
    capacity: num(r.capacity),
    registered: num(r.registered) ?? 0,
    spotsLeft: num(r.spotsLeft),
    isFull: r.isFull === true,
    registrationOpen: r.registrationOpen !== false,
    venue: str(r.venue),
    city: str(r.city),
    image: imageUrl(r.image),
  };
}

/**
 * Upcoming tournaments, soonest first (the feed's own order). `null` means the
 * feed could not be read — different from an empty list, which is a normal
 * answer when nothing is scheduled.
 */
export async function getUpcomingTournaments(): Promise<Tournament[] | null> {
  try {
    const res = await fetch(FEED_URL, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const data = (body as { data?: unknown } | null)?.data;
    if (!Array.isArray(data)) return null;
    return data.map(parse).filter((t): t is Tournament => t !== null);
  } catch {
    return null;
  }
}
