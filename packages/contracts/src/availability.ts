import { z } from 'zod';
import { SPORTS } from './enums';
import type { SlotState } from './enums';

/** `GET /availability` query (spec §13). Params arrive as strings → coerced. */
export const availabilityQuerySchema = z.object({
  clubId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  sport: z.enum(SPORTS).optional(),
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
  courts: AvailabilityCourt[];
  slots: AvailabilitySlot[];
}
