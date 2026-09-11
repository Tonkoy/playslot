import { z } from 'zod';
import type { SlotState } from './enums';

/** Coach directory entry (spec §15/§10). */
export interface CoachListItem {
  coachProfileId: number;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  hourlyRateCents: number | null;
  languages: string[];
  levels: string[];
  clubs: { id: number; name: string; slug: string }[];
  services: CoachServiceDto[];
  /** Weekly working hours (0=Sun…6=Sat); present on the single-coach view. */
  workingHours?: { weekday: number; startMin: number; endMin: number }[];
}

/** The coach's own editable public profile. */
export interface CoachProfileDto {
  coachProfileId: number;
  bio: string | null;
  photoUrl: string | null;
  hourlyRateCents: number | null;
  languages: string[];
  levels: string[];
}

export const updateCoachProfileSchema = z.object({
  bio: z.string().max(2000).nullish(),
  photoUrl: z.string().url().max(2000).nullish().or(z.literal('')),
  hourlyRateCents: z.number().int().min(0).max(100_000_00).nullish(),
});
export type UpdateCoachProfileInput = z.infer<typeof updateCoachProfileSchema>;

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

/** A coach's own lesson on their weekly schedule (spec §19). */
export interface CoachScheduleLesson {
  reservationId: number;
  startsAt: string; // ISO, offset-aware
  endsAt: string;
  time: string; // HH:mm in the coach's timezone
  clubName: string;
  customerName: string;
  courtName: string | null;
  status: string;
}

/** One day column of the coach week (empty `lessons` when free). */
export interface CoachScheduleDay {
  date: string; // YYYY-MM-DD in the coach's timezone
  weekday: number; // 0=Sun … 6=Sat
  lessons: CoachScheduleLesson[];
}

export interface CoachScheduleResponse {
  timezone: string;
  from: string; // YYYY-MM-DD (inclusive)
  to: string; // YYYY-MM-DD (exclusive)
  days: CoachScheduleDay[]; // exactly 7, ordered
}

/** A coach's working hours for one weekday (0=Sun … 6=Sat), minutes from midnight. */
export interface CoachHoursDay {
  weekday: number;
  startMin: number;
  endMin: number;
}

export interface CoachHoursResponse {
  timezone: string;
  days: CoachHoursDay[]; // only working days; a missing weekday means day off
}

/** Coach sets their own weekly working hours (one interval per working day). */
export const updateCoachHoursSchema = z.object({
  days: z
    .array(
      z
        .object({
          weekday: z.number().int().min(0).max(6),
          startMin: z.number().int().min(0).max(24 * 60),
          endMin: z.number().int().min(0).max(24 * 60),
        })
        .refine((d) => d.endMin > d.startMin, { message: 'endMin must be after startMin' }),
    )
    .max(7),
});
export type UpdateCoachHoursInput = z.infer<typeof updateCoachHoursSchema>;
