import type { ClubPublic } from './api';

/*
 * A place on the map for clubs that have not pinned one yet, looked up from
 * their street address with OpenStreetMap's geocoder (Nominatim). Without it
 * a new club is missing from the map until someone opens its settings.
 *
 * The lookups are few and cached for a week, as Nominatim's usage policy
 * asks; they are also bounded, so a slow or unreachable geocoder costs the
 * page a moment and a pin, never an error.
 */
const GEOCODER = process.env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org/search';
const WEEK_S = 7 * 24 * 60 * 60;
/** At most this many lookups per page render; the rest wait for the next one. */
const MAX_LOOKUPS = 3;
const LOOKUP_TIMEOUT_MS = 2500;

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `${GEOCODER}?format=jsonv2&limit=1&countrycodes=bg&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PlaySlot/1.0 (+https://playslot.bg)', 'Accept-Language': 'bg' },
      next: { revalidate: WEEK_S },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const hit = ((await res.json()) as { lat?: string; lon?: string }[])[0];
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

/** The clubs, with an address-based position (marked `pinApprox`) for those that have none of their own. */
export async function withApproxPins(clubs: ClubPublic[]): Promise<ClubPublic[]> {
  let lookups = 0;
  const out: ClubPublic[] = [];
  for (const c of clubs) {
    if ((c.lat != null && c.lng != null) || !c.address.trim() || lookups >= MAX_LOOKUPS) {
      out.push(c);
      continue;
    }
    lookups++;
    const city = c.city.name;
    const query = c.address.toLocaleLowerCase('bg').includes(city.toLocaleLowerCase('bg')) ? c.address : `${c.address}, ${city}`;
    const pos = await geocode(query);
    out.push(pos ? { ...c, ...pos, pinApprox: true } : c);
  }
  return out;
}
