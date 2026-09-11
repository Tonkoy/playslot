import { z } from 'zod';

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
});
export type CreateGroupSessionInput = z.infer<typeof createGroupSessionSchema>;

export interface GroupSessionDto {
  id: number;
  coachProfileId: number;
  coachName: string;
  clubId: number;
  clubName: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  priceCents: number;
  currency: string;
  registeredCount: number;
  spotsLeft: number;
  registered: boolean; // whether the current user is registered
  cancelled: boolean;
}
