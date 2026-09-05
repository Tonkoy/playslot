import { z } from 'zod';
import { SPORTS } from './enums';

/**
 * Shared request schemas (spec §13). Zod is the single validation source for API
 * and web (golden rule §2.9). Keep messages generic here; the API localizes
 * user-facing errors via the error contract (§14).
 */

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a digit');

export const registerSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z.string().email().max(200),
    password,
    confirm: z.string(),
    turnstileToken: z.string().optional(),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the terms' }),
    }),
    subscribe: z.boolean().optional(),
    isVisible: z.boolean().optional(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(1) });
export const resendVerificationSchema = z.object({ email: z.string().email() });
export const forgotPasswordSchema = z.object({ email: z.string().email() });
export const resetPasswordSchema = z.object({ token: z.string().min(1), password });

export const clubJoinRequestSchema = z.object({
  clubName: z.string().min(1).max(160),
  city: z.string().min(1).max(120),
  phone: z.string().min(3).max(40),
  ownerName: z.string().min(1).max(120),
  email: z.string().email(),
  password,
  acceptTerms: z.literal(true),
  turnstileToken: z.string().optional(),
});
export type ClubJoinRequestInput = z.infer<typeof clubJoinRequestSchema>;

// ── club / court admin DTOs ──

/** Booking granularity: 30 or 60 minutes only. */
export const slotIntervalSchema = z.coerce
  .number()
  .int()
  .refine((v) => v === 30 || v === 60, { message: 'Slot time must be 30 or 60 minutes' });

export const upsertClubSchema = z.object({
  name: z.string().min(1).max(160),
  slug: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case'),
  address: z.string().min(1).max(240),
  cityId: z.number().int().positive(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  timezone: z.string().min(1).default('Europe/Sofia'),
  currency: z.string().length(3).default('EUR'),
  description: z.string().max(4000).optional(),
  slotIntervalMin: slotIntervalSchema.default(60),
  acceptsMultisport: z.boolean().optional(),
});
export type UpsertClubInput = z.infer<typeof upsertClubSchema>;

/** Club-wide booking granularity — 30 or 60 minutes only (per-club, spec §5). */
export const clubSettingsSchema = z.object({
  slotIntervalMin: slotIntervalSchema,
});
export type ClubSettingsInput = z.infer<typeof clubSettingsSchema>;

export const surfaceEnum = z.enum([
  'CLAY',
  'HARD',
  'GRASS',
  'CARPET',
  'ARTIFICIAL_GRASS',
  'PARQUET',
  'OTHER',
]);

export const upsertCourtSchema = z.object({
  name: z.string().min(1).max(120),
  sport: z.enum(SPORTS).default('TENNIS'),
  surface: surfaceEnum.optional(),
  isIndoor: z.boolean().optional(),
  hasLighting: z.boolean().optional(),
  minReservationMin: z.number().int().min(15).max(240).default(60),
  slotIntervalMin: z.number().int().min(15).max(120).default(30),
  allowHalfHour: z.boolean().default(false),
});
export type UpsertCourtInput = z.infer<typeof upsertCourtSchema>;

export const availabilityRuleSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startMin: z.number().int().min(0).max(1440),
  endMin: z.number().int().min(0).max(1440),
});
export type AvailabilityRuleInput = z.infer<typeof availabilityRuleSchema>;
