import { z } from 'zod';
import { OFFERED_SPORTS } from './enums';
import type { SlotState } from './enums';

/** `GET /availability` query (spec §13). Params arrive as strings → coerced. */
export const availabilityQuerySchema = z.object({
  clubId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  sport: z.enum(OFFERED_SPORTS).optional(),
  duration: z.coerce.number().int().min(15).max(240).optional(),
  coachRequired: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export interface AvailabilityCourt {
  id: number;
  name: string;
  surface: string | null;
  isIndoor: boolean | null;
  hasLighting: boolean | null;
  minReservationMin: number;
  allowHalfHour: boolean;
}

export interface AvailabilitySlot {
  resourceId: number;
  start: string; // ISO-8601 with the club's offset
  end: string;
  state: SlotState;
  priceCents: number | null;
  durationsMin: number[];
  coachIds: number[];
  minReservationMin: number;
  allowHalfHour: boolean;
}

export interface AvailabilityResponse {
  date: string;
  timezone: string;
  currency: string;
  slotIntervalMin: number; // club-wide booking granularity (30 or 60)
  bookingDurationsMin: number[]; // booking lengths the club offers players
  courts: AvailabilityCourt[];
  slots: AvailabilitySlot[];
}

/** `GET /availability/summary` — free-slot counts for a run of days. */
export const availabilitySummaryQuerySchema = z.object({
  clubId: z.coerce.number().int().positive(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  days: z.coerce.number().int().min(1).max(14).default(7),
  duration: z.coerce.number().int().min(15).max(240).optional(),
});
export type AvailabilitySummaryQuery = z.infer<typeof availabilitySummaryQuerySchema>;

export interface AvailabilityDaySummary {
  date: string; // YYYY-MM-DD, the club's calendar day
  free: number; // bookable slots across all courts for the asked duration
}

export interface AvailabilitySummaryResponse {
  days: AvailabilityDaySummary[];
}
