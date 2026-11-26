export interface LatLng {
  lat: number;
  lng: number;
}

/** Five decimals is about a metre: plenty for an entrance, and tidy to store. */
export const roundCoord = (v: number) => Math.round(v * 1e5) / 1e5;

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
/** Where a pasted text may carry a position, most exact first. */
const PATTERNS = [
  // a Google Maps place link: …!3d42.68717!4d23.34105 is the place itself
  new RegExp(`!3d${NUM}!4d${NUM}`),
  // …?q=42.68717,23.34105 and the like
  new RegExp(`[?&](?:q|query|ll|destination|daddr)=${NUM}(?:,|%2C)\\s*${NUM}`, 'i'),
  // …/@42.68717,23.34105,17z is only the middle of the view, so it comes after the two above
  new RegExp(`@${NUM},${NUM}`),
  // plain "42.68717, 23.34105", as Google Maps copies it
  new RegExp(`^\\s*${NUM}\\s*[,;\\s]\\s*${NUM}\\s*$`),
];

/**
 * A position out of what a person pastes: coordinates copied from a map, or a
 * Google Maps link that carries them. Null when there is none in it (a short
 * maps.app.goo.gl link, for one: it hides the address behind a redirect).
 */
export function parseLatLng(text: string): LatLng | null {
  for (const re of PATTERNS) {
    const m = re.exec(text.trim());
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat: roundCoord(lat), lng: roundCoord(lng) };
    }
  }
  return null;
}

/**
 * Google Maps directions to a club: to the spot the club pinned when there is
 * one — that is the entrance, which an address alone often misses — and by
 * name and address otherwise (a position we only looked up is not passed on).
 */
export function directionsUrl(club: {
  name: string;
  address: string;
  city: { name: string };
  lat: number | null;
  lng: number | null;
  pinApprox?: boolean;
}): string {
  const pinned = club.lat != null && club.lng != null && !club.pinApprox;
  const inCity = club.address.toLocaleLowerCase('bg').includes(club.city.name.toLocaleLowerCase('bg'));
  const to = pinned ? `${club.lat},${club.lng}` : `${club.name}, ${club.address}${inCity ? '' : `, ${club.city.name}`}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(to)}`;
}
