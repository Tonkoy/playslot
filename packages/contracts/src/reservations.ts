import { z } from 'zod';
import { PAYMENT_METHODS } from './enums';

/** `POST /reservations` — create a booking (starts as a HOLD, spec §8/§13). */
export const createReservationSchema = z.object({
  clubId: z.number().int().positive(),
  type: z.enum(['COURT', 'LESSON']).default('COURT'),
  startsAt: z.string().datetime({ offset: true }),
  durationMin: z.number().int().min(15).max(240),
  paymentMethod: z.enum(PAYMENT_METHODS),
  resourceIds: z.array(z.number().int().positive()).min(1).max(4),
  coachProfileId: z.number().int().positive().optional(), // Phase 5
  participants: z.array(z.object({ name: z.string().min(1).max(120) })).max(8).optional(),
  turnstileToken: z.string().optional(),
});
export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const cancelReservationSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type ReservationNextAction = 'PAY' | 'CONFIRMED';

export interface CreateReservationResponse {
  reservationId: number;
  status: string;
  holdExpiresAt: string | null;
  priceCents: number;
  currency: string;
  next: { action: ReservationNextAction; checkoutUrl?: string };
}

export interface ReservationSummary {
  id: number;
  clubId: number;
  clubName?: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  currency: string;
  paymentMethod: string;
  resourceIds: number[];
}
