import { z } from 'zod';

/** Events & tournaments with public registration (spec §22 M9). */
export const upsertEventSchema = z.object({
  type: z.enum(['EVENT', 'TOURNAMENT']).default('EVENT'),
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  capacity: z.number().int().min(1).max(1000),
  feeCents: z.number().int().min(0).default(0),
  published: z.boolean().optional(),
});
export type UpsertEventInput = z.infer<typeof upsertEventSchema>;

export interface EventDto {
  id: number;
  clubId: number;
  clubName?: string;
  type: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  feeCents: number;
  registeredCount: number;
  spotsLeft: number;
  registered: boolean; // whether the current user is registered
}
