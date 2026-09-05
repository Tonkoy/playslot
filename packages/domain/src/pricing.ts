/**
 * Pricing resolution (spec §9). Pure and deterministic: given the active price
 * rules and a slot context, exactly one winner is chosen. Never returns free by
 * accident — if nothing matches, it throws so the caller surfaces an error.
 *
 * Money is integer minor units throughout (golden rule §2.6).
 */

export interface PriceRuleLike {
  id: number;
  resourceId: number | null;
  serviceId: number | null;
  weekdayMask: number | null; // bit i set ⇒ active on weekday i (0=Sun … 6=Sat)
  startMin: number | null; // rule window, minutes from local midnight
  endMin: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
  durationMin: number | null; // the duration `priceCents` is quoted for (default 60)
  priceCents: number;
  currency: string;
  priority: number;
  active: boolean;
}

export interface PriceContext {
  weekday: number; // 0=Sun … 6=Sat, computed in the club timezone
  slotStartMin: number; // minutes from local midnight
  slotEndMin: number;
  durationMin: number; // requested slot duration
  date: Date; // absolute instant of the slot start (for validFrom/validUntil)
  resourceId?: number;
  serviceId?: number;
}

export interface ResolvedPrice {
  priceCents: number;
  currency: string;
  ruleId: number;
}

export class PricingError extends Error {}

/** Specificity rank (spec §9): service+resource > resource > service > club-wide. */
function specificity(rule: PriceRuleLike): number {
  const hasResource = rule.resourceId !== null;
  const hasService = rule.serviceId !== null;
  if (hasResource && hasService) return 3;
  if (hasResource) return 2;
  if (hasService) return 1;
  return 0;
}

function matches(rule: PriceRuleLike, ctx: PriceContext): boolean {
  if (!rule.active) return false;
  if (rule.resourceId !== null && rule.resourceId !== ctx.resourceId) return false;
  if (rule.serviceId !== null && rule.serviceId !== ctx.serviceId) return false;
  if (rule.validFrom && ctx.date < rule.validFrom) return false;
  if (rule.validUntil && ctx.date >= rule.validUntil) return false;
  if (rule.weekdayMask !== null && (rule.weekdayMask & (1 << ctx.weekday)) === 0) return false;
  // Rule window must overlap the slot window (half-open).
  if (rule.startMin !== null && rule.endMin !== null) {
    if (!(rule.startMin < ctx.slotEndMin && ctx.slotStartMin < rule.endMin)) return false;
  }
  return true;
}

/**
 * Resolve the price for a slot. First match after sorting by priority, then
 * specificity, then recency (higher id) wins; the quoted price is pro-rated to
 * the requested duration.
 */
export function resolvePrice(rules: PriceRuleLike[], ctx: PriceContext): ResolvedPrice {
  const candidates = rules.filter((r) => matches(r, ctx));
  if (candidates.length === 0) {
    throw new PricingError(
      `No price rule matched (resource=${ctx.resourceId ?? '-'}, service=${ctx.serviceId ?? '-'})`,
    );
  }

  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const sa = specificity(a);
    const sb = specificity(b);
    if (sb !== sa) return sb - sa;
    return b.id - a.id; // recency proxy
  });

  const winner = candidates[0]!;
  const unit = winner.durationMin ?? 60;
  if (unit <= 0) throw new PricingError(`Invalid rule duration for rule ${winner.id}`);
  const priceCents = Math.round((winner.priceCents * ctx.durationMin) / unit);

  return { priceCents, currency: winner.currency, ruleId: winner.id };
}
