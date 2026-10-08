import { z } from 'zod';

/**
 * Self-declared playing level. The same three values coaches list under
 * `levels`, so a player's level lines up with what a coach says they teach.
 */
export const PLAYER_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type PlayerLevel = (typeof PLAYER_LEVELS)[number];

/** A user's own editable account profile (name, avatar, bio, notification prefs). */
export interface UserProfileDto {
  name: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  subscribed: boolean; // newsletter
  notifyByEmail: boolean; // transactional email notifications
  level: PlayerLevel | null; // null until the player picks one
  phone: string | null; // stored in +359… form; not verified yet
}

/**
 * Bulgarian phone number, accepted as either `+359…` or a national `0…` and
 * normalised to the international form. Deliberately permissive about spaces,
 * dashes and brackets — people paste numbers in every shape.
 */
const BG_PHONE = /^(?:\+359|0)(?:8[789]\d{7}|[23-9]\d{7,8})$/;

export function normalizeBgPhone(raw: string): string | null {
  const compact = raw.replace(/[\s()-]/g, '');
  if (!BG_PHONE.test(compact)) return null;
  return compact.startsWith('+') ? compact : `+359${compact.slice(1)}`;
}

export const updateUserProfileSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  avatarUrl: z.string().url().max(2000).nullish().or(z.literal('')),
  bio: z.string().max(2000).nullish(),
  subscribed: z.boolean().optional(),
  notifyByEmail: z.boolean().optional(),
  // null clears the level; omitting the key leaves it untouched.
  level: z.enum(PLAYER_LEVELS).nullish(),
  // Empty string clears the number; anything else must be a valid BG number
  // and is stored normalised.
  phone: z
    .string()
    .max(32)
    .transform((v) => v.trim())
    .refine((v) => v === '' || normalizeBgPhone(v) !== null, { message: 'phone_invalid' })
    .transform((v) => (v === '' ? null : normalizeBgPhone(v)))
    .nullish(),
});
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;

/** A browser's PushSubscription, as `PushSubscription.toJSON()` returns it. */
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
  userAgent: z.string().max(400).optional(),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({ endpoint: z.string().url().max(2000) });
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;

/** What the client needs before it can subscribe. */
export interface PushConfigDto {
  /** VAPID public key, or null when push isn't configured on this deployment. */
  publicKey: string | null;
  /** How many browsers this user currently has subscribed. */
  subscriptions: number;
}
