import { z } from 'zod';

/** Platform-admin creates a club directly (spec §13). */
export const platformCreateClubSchema = z.object({
  name: z.string().min(1).max(160),
  city: z.string().min(1).max(120),
  address: z.string().max(240).optional(),
  timezone: z.string().min(1).max(64).default('Europe/Sofia'),
  currency: z.string().length(3).default('EUR'),
  slotIntervalMin: z.union([z.literal(30), z.literal(60)]).default(60),
});
export type PlatformCreateClubInput = z.infer<typeof platformCreateClubSchema>;

/** Add a person to a club by email — links an existing user or invites a new one. */
export const addMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(160).optional(),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export interface PlatformClubDto {
  id: number;
  slug: string;
  name: string;
  city: string;
  status: string;
  adminCount: number;
  coachCount: number;
  isFeatured: boolean;
}

/** The one club a platform admin has chosen to headline the homepage, together
 * with its soonest free slot (spec: homepage "featured club" card). */
export interface FeaturedClubDto {
  club: {
    id: number;
    slug: string;
    name: string;
    address: string;
    city: string;
  };
  slot: {
    date: string; // YYYY-MM-DD, in the club's timezone
    start: string; // ISO-8601 with the club's offset
    end: string;
    priceCents: number | null;
    currency: string;
    courtName: string;
    hasCoach: boolean;
  };
}

/** Result of an invite/link operation. `inviteLink` is only present for a
 * newly-created account (so the admin can share it while email is unavailable). */
export interface InviteResultDto {
  email: string;
  name: string;
  role: string;
  invited: boolean; // true = new account created + invited; false = existing user linked
  inviteLink?: string;
}

export interface ClubTeamMemberDto {
  userId: number;
  coachProfileId?: number;
  name: string;
  email: string;
  role: 'CLUB_ADMIN' | 'CLUB_STAFF' | 'COACH';
  pending: boolean; // account created but not yet activated (no password set)
}

export interface ClubTeamDto {
  admins: ClubTeamMemberDto[];
  staff: ClubTeamMemberDto[];
  coaches: ClubTeamMemberDto[];
}
