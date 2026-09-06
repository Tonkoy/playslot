import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  canTransition,
  occupiesInventory,
  ReservationTransitionError,
  requiresOnlinePayment,
} from './reservation';

describe('reservation state machine', () => {
  it('allows the on-site/free confirm path', () => {
    expect(canTransition('HOLD', 'CONFIRMED')).toBe(true);
  });

  it('allows the online payment path', () => {
    expect(canTransition('HOLD', 'PENDING_PAYMENT')).toBe(true);
    expect(canTransition('PENDING_PAYMENT', 'CONFIRMED')).toBe(true);
    expect(canTransition('PENDING_PAYMENT', 'CANCELLED')).toBe(true);
  });

  it('allows lifecycle end states from CONFIRMED', () => {
    expect(canTransition('CONFIRMED', 'COMPLETED')).toBe(true);
    expect(canTransition('CONFIRMED', 'NO_SHOW')).toBe(true);
    expect(canTransition('CONFIRMED', 'CANCELLED')).toBe(true);
  });

  it('forbids illegal transitions', () => {
    expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(canTransition('CONFIRMED', 'HOLD')).toBe(false);
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false);
    expect(canTransition('NO_SHOW', 'CONFIRMED')).toBe(false);
  });

  it('assertTransition throws on illegal moves', () => {
    expect(() => assertTransition('HOLD', 'CONFIRMED')).not.toThrow();
    expect(() => assertTransition('CANCELLED', 'CONFIRMED')).toThrow(ReservationTransitionError);
  });

  it('classifies which statuses occupy inventory (drives isActive, §8)', () => {
    expect(occupiesInventory('HOLD')).toBe(true);
    expect(occupiesInventory('PENDING_PAYMENT')).toBe(true);
    expect(occupiesInventory('CONFIRMED')).toBe(true);
    expect(occupiesInventory('COMPLETED')).toBe(true);
    expect(occupiesInventory('CANCELLED')).toBe(false);
    expect(occupiesInventory('NO_SHOW')).toBe(false);
    expect(occupiesInventory('REFUNDED')).toBe(false);
  });

  it('maps only ONLINE to the payment path', () => {
    expect(requiresOnlinePayment('ONLINE')).toBe(true);
    expect(requiresOnlinePayment('ON_SITE')).toBe(false);
    expect(requiresOnlinePayment('FREE')).toBe(false);
    expect(requiresOnlinePayment('MULTISPORT')).toBe(false);
  });
});
