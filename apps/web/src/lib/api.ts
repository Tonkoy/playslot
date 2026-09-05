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
  slotIntervalMin: number;
  acceptsMultisport: boolean;
  paymentMethods: string[];
  status: string;
  cityId: number;
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

// ── client-side auth + admin (credentialed) ──

export interface Me {
  id: number;
  email: string;
  name: string;
  locale: string;
  emailVerified: boolean;
  roles: string[];
}

export interface AdminClub extends ClubPublic {
  cityId: number;
}

export interface MyClubMembership {
  role: string;
  club: AdminClub;
}

export interface AdminCourt {
  id: number;
  name: string;
  status: string;
  sport: string | null;
  surface: string | null;
  isIndoor: boolean | null;
  hasLighting: boolean | null;
  minReservationMin: number;
  slotIntervalMin: number;
  allowHalfHour: boolean;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLIENT_BASE}/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export function login(email: string, password: string): Promise<{ user: Me }> {
  return apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function logout(): Promise<{ message: string }> {
  return apiFetch('/auth/logout', { method: 'POST' });
}

export function getMe(): Promise<{ user: Me }> {
  return apiFetch('/auth/me');
}

export function getMyClubs(): Promise<MyClubMembership[]> {
  return apiFetch('/me/clubs');
}

export function googleLoginUrl(returnTo: string): string {
  return `${CLIENT_BASE}/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
}

export function adminListCourts(clubId: number): Promise<AdminCourt[]> {
  return apiFetch(`/clubs/${clubId}/resources`);
}

export interface CourtInput {
  name: string;
  sport: string;
  surface?: string | null;
  isIndoor?: boolean;
  hasLighting?: boolean;
}

export function adminCreateCourt(clubId: number, input: CourtInput): Promise<AdminCourt> {
  return apiFetch(`/clubs/${clubId}/resources`, { method: 'POST', body: JSON.stringify(input) });
}

export function adminUpdateCourt(
  clubId: number,
  courtId: number,
  input: CourtInput,
): Promise<AdminCourt> {
  return apiFetch(`/clubs/${clubId}/resources/${courtId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function adminSetCourtStatus(
  clubId: number,
  courtId: number,
  status: 'ACTIVE' | 'INACTIVE',
): Promise<{ id: number; status: string }> {
  return apiFetch(`/clubs/${clubId}/resources/${courtId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function adminUpdateClubSettings(
  clubId: number,
  slotIntervalMin: number,
): Promise<AdminClub> {
  return apiFetch(`/clubs/${clubId}/settings`, {
    method: 'PATCH',
    body: JSON.stringify({ slotIntervalMin }),
  });
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
