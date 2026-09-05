import type { Role } from '@playslot/db';

/** Attached to the request by JwtAuthGuard after a valid session is verified. */
export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string;
  locale: string;
  emailVerified: boolean;
  roles: Role[];
}

/** JWT session payload (signed with AUTH_SECRET). */
export interface JwtPayload {
  sub: number;
  roles: Role[];
  locale: string;
}

export const SESSION_COOKIE = 'playslot_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
