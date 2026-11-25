import { z } from 'zod';
import { COACH_LEVELS } from './coaching';

/**
 * Coach-hosted group sessions (spec §10/§22): the coach picks an available slot,
 * which reserves the coach + a court, and players register up to capacity. On
 * creation, subscribed players are invited by email.
 */
export const createGroupSessionSchema = z.object({
  clubId: z.number().int().positive(),
  courtId: z.number().int().positive(),
  startsAt: z.string().datetime({ offset: true }),
  durationMin: z.number().int().min(15).max(600),
  capacity: z.number().int().min(2).max(50),
  priceCents: z.number().int().min(0).default(0),
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  /** Who it is for; omitted or null = every level. */
  level: z.enum(COACH_LEVELS).nullable().optional(),
});
export type CreateGroupSessionInput = z.infer<typeof createGroupSessionSchema>;

/**
 * The coach edits their session. Everything is optional: what is left out stays
 * as it is. `slot` moves it to another day/hour (and court), which re-runs the
 * same checks as creating it — the coach and the court must both be free.
 */
export const updateGroupSessionSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).nullable().optional(),
  level: z.enum(COACH_LEVELS).nullable().optional(),
  capacity: z.number().int().min(2).max(50).optional(),
  priceCents: z.number().int().min(0).optional(),
  slot: z
    .object({
      courtId: z.number().int().positive(),
      startsAt: z.string().datetime({ offset: true }),
      durationMin: z.number().int().min(15).max(600),
    })
    .optional(),
});
export type UpdateGroupSessionInput = z.infer<typeof updateGroupSessionSchema>;

export interface GroupSessionDto {
  id: number;
  coachProfileId: number;
  coachName: string;
  coachPhotoUrl: string | null;
  clubId: number;
  clubName: string;
  title: string;
  description: string | null;
  /** 'beginner' | 'intermediate' | 'advanced'; null = every level. */
  level: string | null;
  /** The court it is held on, when known. */
  courtName: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  priceCents: number;
  currency: string;
  registeredCount: number;
  spotsLeft: number;
  registered: boolean; // whether the current user is registered
  cancelled: boolean;
  /** The current user is the coach who runs it. */
  mine: boolean;
  /** Who signed up — only sent to the coach who runs it. */
  participants?: { userId: number; name: string }[];
}
