import { z } from 'zod';

/** Platform-admin account moderation. */

/** Paid by a suspended player to be able to book again (EUR cents). */
export const REINSTATEMENT_FEE_CENTS = 1000;
export const REINSTATEMENT_FEE_CURRENCY = 'EUR';

export const SUSPENSION_REASONS = ['NO_SHOW', 'NON_PAYMENT', 'OTHER'] as const;
export type SuspensionReasonCode = (typeof SUSPENSION_REASONS)[number];

export const suspendUserSchema = z.object({
  reason: z.enum(SUSPENSION_REASONS),
  note: z.string().trim().max(500).optional(),
  /** Cancel the player's upcoming bookings so the courts free up. */
  cancelUpcoming: z.boolean().default(false),
  /** Fee owed to lift the block; 0 = suspension without a fee. */
  feeCents: z.number().int().min(0).max(100_000).default(REINSTATEMENT_FEE_CENTS),
});
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

export const reinstateUserSchema = z.object({
  /** true = fee collected; false = waived by the admin. */
  feePaid: z.boolean(),
});
export type ReinstateUserInput = z.infer<typeof reinstateUserSchema>;

export const deleteUserSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
export type DeleteUserInput = z.infer<typeof deleteUserSchema>;

export interface PlatformUserDto {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  roles: string[];
  emailVerified: boolean;
  createdAt: string;
  noShowCount: number;
  unpaidCount: number;
  bookingCount: number;
  suspendedAt: string | null;
  suspensionReason: SuspensionReasonCode | null;
  suspensionNote: string | null;
  reinstatementFeeCents: number | null;
}

/** The signed-in player's own standing (drives the "account restricted" banner). */
export interface AccountStandingDto {
  suspended: boolean;
  reason: SuspensionReasonCode | null;
  note: string | null;
  feeCents: number;
  currency: string;
}

export interface DeleteUserResultDto {
  /** 'deleted' = no history, row removed; 'anonymized' = history kept, identity wiped. */
  mode: 'deleted' | 'anonymized';
}
