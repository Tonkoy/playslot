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

// ── Club Operating System (staff, spec §16) ──

/** Staff manual/phone booking for a customer (existing id or a name/contact). */
export const manualBookingSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }),
    durationMin: z.number().int().min(15).max(240),
    resourceIds: z.array(z.number().int().positive()).min(1).max(4),
    type: z.enum(['COURT', 'LESSON']).default('COURT'),
    paymentMethod: z.enum(PAYMENT_METHODS).default('ON_SITE'),
    customerUserId: z.number().int().positive().optional(),
    customer: z
      .object({
        name: z.string().min(1).max(120),
        email: z.string().email().optional(),
        phone: z.string().max(40).optional(),
      })
      .optional(),
  })
  .refine((d) => d.customerUserId !== undefined || d.customer !== undefined, {
    message: 'Provide customerUserId or customer details',
    path: ['customer'],
  });
export type ManualBookingInput = z.infer<typeof manualBookingSchema>;

/** Block a resource (maintenance/closure) — occupies inventory like a booking. */
export const blockSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  durationMin: z.number().int().min(15).max(24 * 60),
  resourceIds: z.array(z.number().int().positive()).min(1).max(8),
  reason: z.string().max(200).optional(),
});
export type BlockInput = z.infer<typeof blockSchema>;

/** Move / reschedule / change court — re-runs the conflict check (spec §16). */
export const rescheduleSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  durationMin: z.number().int().min(15).max(240),
  resourceIds: z.array(z.number().int().positive()).min(1).max(4),
});
export type RescheduleInput = z.infer<typeof rescheduleSchema>;

export interface CalendarEntry {
  id: number;
  type: string;
  status: string;
  source: string;
  startsAt: string;
  endsAt: string;
  resourceIds: number[];
  customerName: string | null;
  priceCents: number;
  currency: string;
  paymentMethod: string;
  paymentStatus: string | null;
}

export interface CalendarResponse {
  date: string;
  timezone: string;
  slotIntervalMin: number;
  courts: { id: number; name: string }[];
  entries: CalendarEntry[];
}

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
