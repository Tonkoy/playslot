import { z } from 'zod';
import { SPORTS } from './enums';

/**
 * Shared request schemas (spec §13). Zod is the single validation source for API
 * and web (golden rule §2.9).
 *
 * Validation messages are **codes**, not sentences: the API returns them under
 * `details.fields` and the web renders the user's language from them (§14). An
 * English zod default must never reach the screen.
 */

/** Field-level validation codes. The web has a bg/en label for each. */
export const FIELD_ERROR_CODES = [
  'required',
  'too_long',
  'email_invalid',
  'password_min',
  'password_max',
  'password_lower',
  'password_upper',
  'password_digit',
  'password_mismatch',
  'terms_required',
  'phone_invalid',
] as const;
export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];

const password = z
  .string()
  .min(8, 'password_min')
  .max(200, 'password_max')
  .regex(/[a-z]/, 'password_lower')
  .regex(/[A-Z]/, 'password_upper')
  .regex(/[0-9]/, 'password_digit');

export const registerSchema = z
  .object({
    name: z.string().min(1, 'required').max(120, 'too_long'),
    email: z.string().email('email_invalid').max(200, 'too_long'),
    password,
    confirm: z.string().min(1, 'required'),
    turnstileToken: z.string().optional(),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'terms_required' }),
    }),
    subscribe: z.boolean().optional(),
    isVisible: z.boolean().optional(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'password_mismatch',
    path: ['confirm'],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('email_invalid'),
  password: z.string().min(1, 'required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(1, 'required') });
export const resendVerificationSchema = z.object({ email: z.string().email('email_invalid') });
export const forgotPasswordSchema = z.object({ email: z.string().email('email_invalid') });
export const resetPasswordSchema = z.object({ token: z.string().min(1, 'required'), password });

export const clubJoinRequestSchema = z.object({
  clubName: z.string().min(1, 'required').max(160, 'too_long'),
  city: z.string().min(1, 'required').max(120, 'too_long'),
  phone: z.string().min(3, 'phone_invalid').max(40, 'too_long'),
  ownerName: z.string().min(1, 'required').max(120, 'too_long'),
  email: z.string().email('email_invalid'),
  password,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'terms_required' }) }),
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
  phone: z.string().max(40).optional(),
  photoUrl: z.string().url().max(2000).optional().or(z.literal('')),
  rules: z.string().max(8000).optional(),
  slotIntervalMin: slotIntervalSchema.default(60),
  acceptsMultisport: z.boolean().optional(),
});
export type UpsertClubInput = z.infer<typeof upsertClubSchema>;

/** Club-admin edits to the public profile (partial; name/slug/city stay put). */
export const updateClubProfileSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  address: z.string().min(1).max(240).optional(),
  description: z.string().max(4000).nullish(),
  phone: z.string().max(40).nullish(),
  photoUrl: z.string().url().max(2000).nullish().or(z.literal('')),
  rules: z.string().max(8000).nullish(),
});
export type UpdateClubProfileInput = z.infer<typeof updateClubProfileSchema>;

/** Club-wide booking granularity — 30 or 60 minutes only (per-club, spec §5). */
export const clubSettingsSchema = z.object({
  slotIntervalMin: slotIntervalSchema,
  /**
   * Booking lengths this club offers players. The club owns this list; the
   * player-facing schedule renders exactly these options and nothing else.
   * Each entry must be a whole multiple of the club's slot interval, which
   * the service re-checks against the stored interval before saving.
   */
  bookingDurationsMin: z
    .array(z.number().int().min(15).max(240))
    .min(1)
    .max(8)
    .optional(),
  /** When on, a player's booking waits for club staff to confirm it. */
  requiresBookingApproval: z.boolean().optional(),
});
export type ClubSettingsInput = z.infer<typeof clubSettingsSchema>;

/** Special days: a club closure / downtime window applied to all the club's courts. */
export const createClubClosureSchema = z
  .object({
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fromDate must be YYYY-MM-DD'),
    toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'toDate must be YYYY-MM-DD'),
    allDay: z.boolean().default(true),
    startMin: z.number().int().min(0).max(24 * 60).optional(),
    endMin: z.number().int().min(0).max(24 * 60).optional(),
    reason: z.string().min(1).max(200),
  })
  .refine((v) => v.toDate >= v.fromDate, { message: 'toDate must not be before fromDate' })
  .refine((v) => v.allDay || (v.startMin != null && v.endMin != null && v.endMin > v.startMin), {
    message: 'a timed closure needs start < end',
  });
export type CreateClubClosureInput = z.infer<typeof createClubClosureSchema>;

export const deleteClubClosureSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  /** Narrows the delete to one closure when two share the same range. */
  reason: z.string().max(200).optional(),
});
export type DeleteClubClosureInput = z.infer<typeof deleteClubClosureSchema>;

export interface ClubClosureDto {
  /** First window's start and last window's end (ISO), for delete + display. */
  startsAt: string;
  endsAt: string;
  reason: string;
  courtCount: number;
  /** The closure as entered: local dates and, when timed, the daily window. */
  fromDate: string; // YYYY-MM-DD in the club's timezone
  toDate: string;
  allDay: boolean;
  startMin: number | null;
  endMin: number | null;
  /** How many daily windows this closure holds (1 for a single day / all-day). */
  days: number;
}

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
  slotIntervalMin: z.number().int().min(15).max(120).default(60),
  allowHalfHour: z.boolean().default(false),
});
export type UpsertCourtInput = z.infer<typeof upsertCourtSchema>;

/**
 * A club's price rule. Every field except the price narrows *when* the rule
 * applies; leaving one null means "any". Overlaps are resolved by priority,
 * then specificity, then recency — see resolvePrice in @playslot/domain.
 */
export const upsertPriceRuleSchema = z
  .object({
    /** Null = every court in the club. */
    resourceId: z.number().int().positive().nullish(),
    /** Null = court rental rather than a coaching service. */
    serviceId: z.number().int().positive().nullish(),
    /** Bitmask, bit i = weekday i (0=Sun … 6=Sat). Null = every day. */
    weekdayMask: z.number().int().min(0).max(127).nullish(),
    /** Minutes from local midnight; both or neither. Null = all day. */
    startMin: z.number().int().min(0).max(1440).nullish(),
    endMin: z.number().int().min(0).max(1440).nullish(),
    /** Season window. Null = always in season. */
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    /** The duration the price is quoted for; other lengths are pro-rated. */
    durationMin: z.number().int().min(15).max(480).default(60),
    priceCents: z.number().int().min(0).max(10_000_00),
    priority: z.number().int().min(0).max(1000).default(0),
    active: z.boolean().default(true),
  })
  .refine((r) => (r.startMin == null) === (r.endMin == null), {
    message: 'start_and_end_together',
    path: ['endMin'],
  })
  .refine((r) => r.startMin == null || r.endMin == null || r.startMin < r.endMin, {
    message: 'end_after_start',
    path: ['endMin'],
  })
  .refine((r) => !r.validFrom || !r.validUntil || r.validFrom <= r.validUntil, {
    message: 'until_after_from',
    path: ['validUntil'],
  });
export type UpsertPriceRuleInput = z.infer<typeof upsertPriceRuleSchema>;

export interface PriceRuleDto {
  id: number;
  resourceId: number | null;
  resourceName: string | null;
  serviceId: number | null;
  weekdayMask: number | null;
  startMin: number | null;
  endMin: number | null;
  validFrom: string | null; // YYYY-MM-DD
  validUntil: string | null;
  durationMin: number | null;
  priceCents: number;
  currency: string;
  priority: number;
  active: boolean;
}

/** "What would this slot cost?" — runs the real engine over the club's rules. */
export interface PricePreviewDto {
  priceCents: number | null;
  currency: string;
  /** Which rule won, so the admin can see why. */
  ruleId: number | null;
  /** Set when no rule matches — that slot would be unbookable. */
  error: string | null;
}

export const availabilityRuleSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startMin: z.number().int().min(0).max(1440),
  endMin: z.number().int().min(0).max(1440),
});
export type AvailabilityRuleInput = z.infer<typeof availabilityRuleSchema>;
