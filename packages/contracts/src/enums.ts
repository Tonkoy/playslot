/**
 * Shared enums mirrored from the Prisma schema (spec §5). Kept here so web and
 * api agree on the string unions without importing the Prisma client into the
 * browser bundle. Prisma remains the source of truth; keep these in sync.
 */

export const SPORTS = [
  'TENNIS',
  'TABLE_TENNIS',
  'BADMINTON',
  'PADEL',
  'FOOTBALL',
  'BASKETBALL',
  'VOLLEYBALL',
  'BEACH_TENNIS',
  'BEACH_VOLLEYBALL',
  'PICKLEBALL',
  'SQUASH',
] as const;
export type Sport = (typeof SPORTS)[number];

export const ROLES = ['PLAYER', 'COACH', 'CLUB_STAFF', 'CLUB_ADMIN', 'PLATFORM_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const RESERVATION_STATUSES = [
  'HOLD',
  'PENDING_PAYMENT',
  'CONFIRMED',
  'COMPLETED',
  'NO_SHOW',
  'CANCELLED',
  'REFUNDED',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Slot states shown on the public grid (spec §7). Never color-only in the UI. */
export const SLOT_STATES = [
  'FREE',
  'RESERVED',
  'MINE',
  'UNAVAILABLE',
  'PAST',
  'EVENT',
  'TOURNAMENT',
] as const;
export type SlotState = (typeof SLOT_STATES)[number];

export const PAYMENT_METHODS = ['ON_SITE', 'ONLINE', 'FREE', 'MULTISPORT'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
