import { describe, expect, it } from 'vitest';
import { computeRefund, hoursUntil, RefundError, type RefundTier } from './cancellation';

// Court default policy (spec §12).
const COURT_TIERS: RefundTier[] = [
  { minHoursBefore: 24, refundPercent: 100 },
  { minHoursBefore: 12, refundPercent: 50 },
  { minHoursBefore: 0, refundPercent: 0 },
];

describe('computeRefund', () => {
  it('full refund at or beyond 24h', () => {
    expect(computeRefund(COURT_TIERS, 30, 4200)).toEqual({ refundPercent: 100, refundCents: 4200 });
    expect(computeRefund(COURT_TIERS, 24, 4200).refundCents).toBe(4200);
  });

  it('half refund in the 12–24h window', () => {
    expect(computeRefund(COURT_TIERS, 18, 4200)).toEqual({ refundPercent: 50, refundCents: 2100 });
    expect(computeRefund(COURT_TIERS, 12, 4201).refundCents).toBe(2101); // half-up rounding
  });

  it('no refund under 12h', () => {
    expect(computeRefund(COURT_TIERS, 2, 4200)).toEqual({ refundPercent: 0, refundCents: 0 });
    expect(computeRefund(COURT_TIERS, 0, 4200).refundCents).toBe(0);
  });

  it('lesson policy (≥24h → 100%, else 0)', () => {
    const lesson: RefundTier[] = [
      { minHoursBefore: 24, refundPercent: 100 },
      { minHoursBefore: 0, refundPercent: 0 },
    ];
    expect(computeRefund(lesson, 25, 5000).refundCents).toBe(5000);
    expect(computeRefund(lesson, 10, 5000).refundCents).toBe(0);
  });

  it('is order-independent (sorts tiers)', () => {
    const shuffled: RefundTier[] = [
      { minHoursBefore: 0, refundPercent: 0 },
      { minHoursBefore: 24, refundPercent: 100 },
      { minHoursBefore: 12, refundPercent: 50 },
    ];
    expect(computeRefund(shuffled, 18, 4200).refundPercent).toBe(50);
  });

  it('no matching tier → zero refund', () => {
    expect(computeRefund([{ minHoursBefore: 48, refundPercent: 100 }], 10, 4200).refundCents).toBe(0);
  });

  it('rejects invalid price', () => {
    expect(() => computeRefund(COURT_TIERS, 24, -5)).toThrow(RefundError);
  });
});

describe('hoursUntil', () => {
  it('computes positive hours before start', () => {
    const now = new Date('2026-06-10T10:00:00Z');
    expect(hoursUntil(new Date('2026-06-11T10:00:00Z'), now)).toBe(24);
    expect(hoursUntil(new Date('2026-06-10T08:00:00Z'), now)).toBe(-2);
  });
});
