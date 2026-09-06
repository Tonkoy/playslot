import { z } from 'zod';
import type { SlotState } from './enums';

/** Coach directory entry (spec §15/§10). */
export interface CoachListItem {
  coachProfileId: number;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  languages: string[];
  levels: string[];
  clubs: { id: number; name: string; slug: string }[];
  services: CoachServiceDto[];
}

export interface CoachServiceDto {
  id: number;
  name: string;
  durationMin: number;
  minPlayers: number;
  maxPlayers: number;
  priceCents: number;
}

/** Coach-first availability (spec §7): the coach's free slots at a club/date. */
export const coachAvailabilityQuerySchema = z.object({
  clubId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  serviceId: z.coerce.number().int().positive().optional(),
});
export type CoachAvailabilityQuery = z.infer<typeof coachAvailabilityQuerySchema>;

export interface CoachSlot {
  start: string;
  end: string;
  state: SlotState;
  /** Courts free for this coach slot (court-first fallback / compatible courts). */
  compatibleCourtIds: number[];
}

export interface CoachAvailabilityResponse {
  coachProfileId: number;
  clubId: number;
  date: string;
  timezone: string;
  currency: string;
  slots: CoachSlot[];
}
