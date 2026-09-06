/**
 * Cancellation refund policy (spec §12/§18). Pure and deterministic so the
 * money math is unit-tested independently. Policies are stored per club per
 * reservation type as an ordered list of tiers; the caller supplies how many
 * hours before start the cancellation happens.
 *
 * Example (court default): ≥24h → 100% · 12–24h → 50% · <12h → 0%.
 */

export interface RefundTier {
  minHoursBefore: number; // qualify when hoursBeforeStart >= this
  refundPercent: number; // 0–100
}

export interface RefundResult {
  refundCents: number;
  refundPercent: number;
}

export class RefundError extends Error {}

/**
 * Compute the refund for a cancellation. Tiers are evaluated from the most
 * generous window down; the first whose `minHoursBefore` is satisfied wins. If
 * none match (no zero-hour tier), the refund is 0 — never refunds by accident.
 */
export function computeRefund(
  tiers: RefundTier[],
  hoursBeforeStart: number,
  priceCents: number,
): RefundResult {
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    throw new RefundError(`priceCents must be a non-negative integer, got ${priceCents}`);
  }
  const sorted = [...tiers].sort((a, b) => b.minHoursBefore - a.minHoursBefore);
  const tier = sorted.find((t) => hoursBeforeStart >= t.minHoursBefore);
  const refundPercent = tier ? clampPercent(tier.refundPercent) : 0;
  return { refundPercent, refundCents: Math.round((priceCents * refundPercent) / 100) };
}

function clampPercent(p: number): number {
  if (p < 0) return 0;
  if (p > 100) return 100;
  return p;
}

/** Hours between now and the reservation start (may be negative if already started). */
export function hoursUntil(startsAt: Date, now: Date = new Date()): number {
  return (startsAt.getTime() - now.getTime()) / 3_600_000;
}
