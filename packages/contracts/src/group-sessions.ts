import { z } from 'zod';
import { COACH_LEVELS } from './coaching';

/**
 * Coach-hosted group sessions (spec §10/§22): the coach picks an available slot,
 * which reserves the coach + a court, and players register up to capacity. On
 * creation, subscribed players are invited by email.
 *
 * A player can host one too, on a court they booked: see `openGameSchema`.
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

/** What people come for. */
export const GROUP_SESSION_KINDS = ['TRAINING', 'SPARRING'] as const;
export type GroupSessionKind = (typeof GROUP_SESSION_KINDS)[number];

/** OPEN: signing up takes a place at once. APPROVAL: the organiser lets each person in. */
export const JOIN_MODES = ['OPEN', 'APPROVAL'] as const;
export type JoinMode = (typeof JOIN_MODES)[number];

/**
 * Who pays for the court of a player's game: the organiser alone, or everyone
 * an equal share. (A coach's training is neither: its price is the coach's fee,
 * 'FEE'.) PlaySlot takes no money for either — the players settle at the club.
 */
export const PLAYER_COST_SPLITS = ['ORGANIZER', 'SHARED'] as const;
export type CostSplit = (typeof PLAYER_COST_SPLITS)[number] | 'FEE';

/**
 * A player opens a court they have booked to other players (spec: sparring and
 * trainings organised by players). The day, hour, court and club are the
 * booking's; this adds what the game is and how people get in.
 */
export const openGameSchema = z.object({
  reservationId: z.number().int().positive(),
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  kind: z.enum(GROUP_SESSION_KINDS),
  level: z.enum(COACH_LEVELS).nullable().optional(),
  /** Places for other players; the organiser is not counted. One is enough for a sparring partner. */
  capacity: z.number().int().min(1).max(30),
  joinMode: z.enum(JOIN_MODES),
  costSplit: z.enum(PLAYER_COST_SPLITS),
});
export type OpenGameInput = z.infer<typeof openGameSchema>;

/**
 * Each player's share of a court when it is split equally among a full game:
 * the organiser plus `capacity` others. Rounded up to a whole cent.
 */
export function courtShareCents(courtPriceCents: number, capacity: number): number {
  return Math.ceil(courtPriceCents / (capacity + 1));
}

/**
 * The organiser edits their session. Everything is optional: what is left out stays
 * as it is. `slot` moves it to another day/hour (and court), which re-runs the
 * same checks as creating it — the coach and the court must both be free.
 */
export const updateGroupSessionSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).nullable().optional(),
  level: z.enum(COACH_LEVELS).nullable().optional(),
  capacity: z.number().int().min(1).max(50).optional(),
  /** A coach's price per player. Ignored for a player's game: there it follows from the court's price. */
  priceCents: z.number().int().min(0).optional(),
  /** A player's game only. */
  kind: z.enum(GROUP_SESSION_KINDS).optional(),
  joinMode: z.enum(JOIN_MODES).optional(),
  costSplit: z.enum(PLAYER_COST_SPLITS).optional(),
  slot: z
    .object({
      courtId: z.number().int().positive(),
      startsAt: z.string().datetime({ offset: true }),
      durationMin: z.number().int().min(15).max(600),
    })
    .optional(),
});
export type UpdateGroupSessionInput = z.infer<typeof updateGroupSessionSchema>;

export interface GroupSessionParticipant {
  userId: number;
  name: string;
  photoUrl: string | null;
  /** The player's own level from their profile, when they have set it. */
  level: string | null;
  status: 'CONFIRMED' | 'PENDING';
}

export interface GroupSessionDto {
  id: number;
  /** The coach who runs it; null when a player organises it. */
  coachProfileId: number | null;
  /** Kept for older clients: the organiser's name and picture. */
  coachName: string;
  coachPhotoUrl: string | null;
  organizerUserId: number;
  organizerName: string;
  organizerPhotoUrl: string | null;
  kind: GroupSessionKind;
  joinMode: JoinMode;
  /** What `priceCents` is: the coach's fee, a share of the court, or nothing (the organiser pays). */
  costSplit: CostSplit;
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
  /** People with a place (those still waiting for the organiser are not counted). */
  registeredCount: number;
  spotsLeft: number;
  /** The current user has a place. */
  registered: boolean;
  /** The current user asked to join and is waiting for the organiser. */
  pending: boolean;
  cancelled: boolean;
  /** The current user organises it. */
  mine: boolean;
  /** How many are waiting to be let in — only sent to the organiser. */
  pendingCount?: number;
  /** Who signed up or asked to — only sent to the organiser. */
  participants?: GroupSessionParticipant[];
}
