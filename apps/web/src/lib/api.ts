import type { AvailabilityResponse } from '@playslot/contracts';

/**
 * Thin typed client for the PlaySlot API. Server components use the server base
 * (API_BASE_URL, server-to-server); client components use the public base.
 */
const SERVER_BASE = process.env.API_BASE_URL ?? 'http://localhost:3001';
export const CLIENT_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export interface ClubPublic {
  id: number;
  slug: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  timezone: string;
  currency: string;
  description: string | null;
  acceptsMultisport: boolean;
  paymentMethods: string[];
  status: string;
  city: { id: number; name: string };
}

export interface CourtPublic {
  id: number;
  name: string;
  sport: string | null;
  surface: string | null;
  isIndoor: boolean | null;
  hasLighting: boolean | null;
  minReservationMin: number;
  slotIntervalMin: number;
  allowHalfHour: boolean;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── server-side reads (RSC) ──
export function getClubs(): Promise<ClubPublic[] | null> {
  return getJson<ClubPublic[]>(`${SERVER_BASE}/api/clubs`);
}

export function getClub(slug: string): Promise<ClubPublic | null> {
  return getJson<ClubPublic>(`${SERVER_BASE}/api/clubs/${encodeURIComponent(slug)}`);
}

export function getClubCourts(slug: string): Promise<CourtPublic[] | null> {
  return getJson<CourtPublic[]>(`${SERVER_BASE}/api/clubs/${encodeURIComponent(slug)}/courts`);
}

// ── client-side read (grid) ──
export async function fetchAvailability(params: {
  clubId: number;
  date: string;
  duration?: number;
}): Promise<AvailabilityResponse> {
  const qs = new URLSearchParams({
    clubId: String(params.clubId),
    date: params.date,
    ...(params.duration ? { duration: String(params.duration) } : {}),
  });
  const res = await fetch(`${CLIENT_BASE}/api/availability?${qs.toString()}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Availability request failed (${res.status})`);
  }
  return (await res.json()) as AvailabilityResponse;
}
