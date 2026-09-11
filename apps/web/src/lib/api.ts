import type {
  AvailabilityResponse,
  CalendarResponse,
  ClubReviews,
  CoachListItem,
  CoachScheduleResponse,
  EventDto,
  FavoriteClub,
  MembershipDto,
  MembershipPlanDto,
  ReservationSummary,
  SearchResponse,
  UpsertEventInput,
  UpsertMembershipPlanInput,
} from '@playslot/contracts';

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

export function getCoaches(clubId?: number): Promise<CoachListItem[] | null> {
  const qs = clubId ? `?clubId=${clubId}` : '';
  return getJson<CoachListItem[]>(`${SERVER_BASE}/api/coaches${qs}`);
}

export function getCoach(id: number): Promise<CoachListItem | null> {
  return getJson<CoachListItem>(`${SERVER_BASE}/api/coaches/${id}`);
}

export function getClubReviews(clubId: number): Promise<ClubReviews | null> {
  return getJson<ClubReviews>(`${SERVER_BASE}/api/clubs/${clubId}/reviews`);
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

export function register(input: {
  name: string;
  email: string;
  password: string;
  confirm: string;
  acceptTerms: true;
  subscribe?: boolean;
  isVisible?: boolean;
}): Promise<{ user: Me; message: string }> {
  return apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(input) });
}

export function requestPasswordReset(email: string): Promise<{ message: string }> {
  return apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
}

export function resetPassword(token: string, password: string): Promise<{ message: string }> {
  return apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
}

export function verifyEmail(token: string): Promise<{ message: string }> {
  return apiFetch('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) });
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

// ── Club OS (staff) ──
export function getCalendar(clubId: number, date: string): Promise<CalendarResponse> {
  return apiFetch(`/clubs/${clubId}/calendar?date=${date}`);
}

export function createManualBooking(
  clubId: number,
  input: { startsAt: string; durationMin: number; resourceIds: number[]; customer: { name: string }; paymentMethod?: string },
): Promise<{ reservationId: number; status: string }> {
  return apiFetch(`/clubs/${clubId}/reservations`, { method: 'POST', body: JSON.stringify(input) });
}

export function createBlock(
  clubId: number,
  input: { startsAt: string; durationMin: number; resourceIds: number[]; reason?: string },
): Promise<{ reservationId: number; status: string }> {
  return apiFetch(`/clubs/${clubId}/blocks`, { method: 'POST', body: JSON.stringify(input) });
}

export function rescheduleReservation(
  clubId: number,
  id: number,
  input: { startsAt: string; durationMin: number; resourceIds: number[] },
): Promise<{ id: number }> {
  return apiFetch(`/clubs/${clubId}/reservations/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function cancelReservationAsStaff(clubId: number, id: number, reason?: string): Promise<{ status: string }> {
  return apiFetch(`/clubs/${clubId}/reservations/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function markReservationPaid(clubId: number, id: number): Promise<{ paymentStatus: string }> {
  return apiFetch(`/clubs/${clubId}/reservations/${id}/mark-paid`, { method: 'POST' });
}

export function markReservationNoShow(clubId: number, id: number): Promise<{ status: string }> {
  return apiFetch(`/clubs/${clubId}/reservations/${id}/no-show`, { method: 'POST' });
}

// ── consumer booking ──
export interface CreateReservationResult {
  reservationId: number;
  status: string;
  holdExpiresAt: string | null;
  priceCents: number;
  currency: string;
  next: { action: 'PAY' | 'CONFIRMED'; checkoutUrl?: string };
}

export function createReservation(input: {
  clubId: number;
  type: 'COURT' | 'LESSON';
  startsAt: string;
  durationMin: number;
  paymentMethod: string;
  resourceIds: number[];
  coachProfileId?: number;
  serviceId?: number;
}): Promise<CreateReservationResult> {
  return apiFetch('/reservations', { method: 'POST', body: JSON.stringify(input) });
}

/** Coaches available at a club (for the court-first "add coach" flow). */
export function coachesForClub(clubId: number): Promise<CoachListItem[]> {
  return apiFetch(`/coaches?clubId=${clubId}`);
}

/** The signed-in coach's own weekly schedule (from = YYYY-MM-DD, Monday of the week). */
export function getMyCoachSchedule(from?: string): Promise<CoachScheduleResponse> {
  return apiFetch(`/coaches/me/schedule${from ? `?from=${from}` : ''}`);
}

// ── favorites + reviews (client) ──
export function getFavorites(): Promise<FavoriteClub[]> {
  return apiFetch('/me/favorites');
}
export function addFavorite(clubId: number): Promise<{ ok: true }> {
  return apiFetch('/me/favorites', { method: 'POST', body: JSON.stringify({ clubId }) });
}
export function removeFavorite(clubId: number): Promise<{ ok: true }> {
  return apiFetch(`/me/favorites/${clubId}`, { method: 'DELETE' });
}
export function submitReview(
  clubId: number,
  input: { rating: number; comment?: string },
): Promise<{ id: number; rating: number }> {
  return apiFetch(`/clubs/${clubId}/reviews`, { method: 'POST', body: JSON.stringify(input) });
}

export function searchAvailability(params: {
  date: string;
  sport?: string;
  duration?: number;
}): Promise<SearchResponse> {
  const qs = new URLSearchParams({ date: params.date });
  if (params.sport) qs.set('sport', params.sport);
  if (params.duration) qs.set('duration', String(params.duration));
  return apiFetch(`/search?${qs.toString()}`);
}

export function getMyReservations(): Promise<ReservationSummary[]> {
  return apiFetch('/me/reservations');
}

// ── memberships (Phase 9 extras) ──
export function getClubMembershipPlans(clubId: number): Promise<MembershipPlanDto[]> {
  return apiFetch(`/clubs/${clubId}/membership-plans`);
}
export function getMyMemberships(): Promise<MembershipDto[]> {
  return apiFetch('/me/memberships');
}
export function adminCreateMembershipPlan(
  clubId: number,
  input: UpsertMembershipPlanInput,
): Promise<MembershipPlanDto> {
  return apiFetch(`/clubs/${clubId}/membership-plans`, { method: 'POST', body: JSON.stringify(input) });
}
export function adminUpdateMembershipPlan(
  clubId: number,
  planId: number,
  input: UpsertMembershipPlanInput,
): Promise<MembershipPlanDto> {
  return apiFetch(`/clubs/${clubId}/membership-plans/${planId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
export function adminGrantMembership(
  clubId: number,
  input: { userEmail: string; planId: number },
): Promise<MembershipDto> {
  return apiFetch(`/clubs/${clubId}/memberships`, { method: 'POST', body: JSON.stringify(input) });
}

// ── events / tournaments (Phase 9 extras) ──
export function listEvents(clubId?: number): Promise<EventDto[]> {
  return apiFetch(`/events${clubId ? `?clubId=${clubId}` : ''}`);
}
export function getEvent(id: number): Promise<EventDto> {
  return apiFetch(`/events/${id}`);
}
export function registerEvent(id: number): Promise<{ ok: true; spotsLeft: number }> {
  return apiFetch(`/events/${id}/register`, { method: 'POST' });
}
export function unregisterEvent(id: number): Promise<{ ok: true }> {
  return apiFetch(`/events/${id}/register`, { method: 'DELETE' });
}
export function adminCreateEvent(clubId: number, input: UpsertEventInput): Promise<EventDto> {
  return apiFetch(`/clubs/${clubId}/events`, { method: 'POST', body: JSON.stringify(input) });
}
export function adminUpdateEvent(
  clubId: number,
  eventId: number,
  input: UpsertEventInput,
): Promise<EventDto> {
  return apiFetch(`/clubs/${clubId}/events/${eventId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function cancelMyReservation(
  id: number,
  reason?: string,
): Promise<{ status: string; refundCents: number; refundStatus: string }> {
  return apiFetch(`/reservations/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
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
