import { z } from 'zod';

/** A user's own editable account profile (name, avatar, bio, notification prefs). */
export interface UserProfileDto {
  name: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  subscribed: boolean; // newsletter
  notifyByEmail: boolean; // transactional email notifications
}

export const updateUserProfileSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  avatarUrl: z.string().url().max(2000).nullish().or(z.literal('')),
  bio: z.string().max(2000).nullish(),
  subscribed: z.boolean().optional(),
  notifyByEmail: z.boolean().optional(),
});
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
