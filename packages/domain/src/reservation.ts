/**
 * Reservation state machine (spec §6). Pure and framework-free so the transition
 * rules are unit-tested independently of Nest/Prisma. The API layer performs the
 * permission + availability guards; this module answers only "is this status
 * change legal, and does this status occupy inventory?".
 */

export type ReservationStatus =
  | 'HOLD'
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'CANCELLED'
  | 'REFUNDED';

/**
 * Statuses that occupy inventory — these keep ReservationResource.isActive true
 * and therefore participate in the no-overlap EXCLUDE constraint (spec §8).
 */
export const OCCUPYING_STATUSES: readonly ReservationStatus[] = [
  'HOLD',
  'PENDING_PAYMENT',
  'CONFIRMED',
  'COMPLETED',
];

export function occupiesInventory(status: ReservationStatus): boolean {
  return OCCUPYING_STATUSES.includes(status);
}

const TRANSITIONS: Record<ReservationStatus, readonly ReservationStatus[]> = {
  HOLD: ['CONFIRMED', 'PENDING_PAYMENT', 'CANCELLED'],
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'NO_SHOW', 'CANCELLED'],
  COMPLETED: ['REFUNDED'],
  NO_SHOW: [],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
};

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class ReservationTransitionError extends Error {
  constructor(from: ReservationStatus, to: ReservationStatus) {
    super(`Illegal reservation transition: ${from} → ${to}`);
    this.name = 'ReservationTransitionError';
  }
}

export function assertTransition(from: ReservationStatus, to: ReservationStatus): void {
  if (!canTransition(from, to)) throw new ReservationTransitionError(from, to);
}

/** Payment method → whether the online payment path (PENDING_PAYMENT) is used. */
export function requiresOnlinePayment(paymentMethod: string): boolean {
  return paymentMethod === 'ONLINE';
}
