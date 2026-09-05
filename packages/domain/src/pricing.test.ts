import { describe, expect, it } from 'vitest';
import { type PriceContext, type PriceRuleLike, PricingError, resolvePrice } from './pricing';

function rule(partial: Partial<PriceRuleLike>): PriceRuleLike {
  return {
    id: 1,
    resourceId: null,
    serviceId: null,
    weekdayMask: null,
    startMin: null,
    endMin: null,
    validFrom: null,
    validUntil: null,
    durationMin: 60,
    priceCents: 3000,
    currency: 'EUR',
    priority: 0,
    active: true,
    ...partial,
  };
}

const baseCtx: PriceContext = {
  weekday: 3, // Wednesday
  slotStartMin: 18 * 60,
  slotEndMin: 19 * 60,
  durationMin: 60,
  date: new Date('2026-06-10T15:00:00Z'),
  resourceId: 706,
};

describe('resolvePrice', () => {
  it('falls back to the club-wide default', () => {
    const res = resolvePrice([rule({ id: 1, priceCents: 3000 })], baseCtx);
    expect(res.priceCents).toBe(3000);
    expect(res.ruleId).toBe(1);
  });

  it('throws when nothing matches (never free by accident)', () => {
    expect(() => resolvePrice([], baseCtx)).toThrow(PricingError);
    expect(() =>
      resolvePrice([rule({ resourceId: 999 })], baseCtx),
    ).toThrow(PricingError);
  });

  it('prefers a more specific rule at equal priority (resource > club-wide)', () => {
    const res = resolvePrice(
      [rule({ id: 1, priceCents: 3000 }), rule({ id: 2, resourceId: 706, priceCents: 4200 })],
      baseCtx,
    );
    expect(res.ruleId).toBe(2);
    expect(res.priceCents).toBe(4200);
  });

  it('prefers higher priority even over a more specific rule', () => {
    const res = resolvePrice(
      [
        rule({ id: 1, resourceId: 706, priceCents: 4200, priority: 0 }),
        rule({ id: 2, priceCents: 5000, priority: 10 }), // club-wide but higher priority
      ],
      baseCtx,
    );
    expect(res.ruleId).toBe(2);
  });

  it('honors the weekday mask', () => {
    const monToFri = 0b0111110;
    expect(resolvePrice([rule({ weekdayMask: monToFri, priceCents: 4200 })], baseCtx).priceCents).toBe(
      4200,
    );
    // Sunday (weekday 0) not in Mon–Fri mask → no match
    expect(() =>
      resolvePrice([rule({ weekdayMask: monToFri })], { ...baseCtx, weekday: 0 }),
    ).toThrow(PricingError);
  });

  it('honors the time window (peak 17:00–22:00)', () => {
    const peak = rule({ startMin: 17 * 60, endMin: 22 * 60, priceCents: 4200, priority: 5 });
    const offpeak = rule({ id: 9, priceCents: 3000 });
    // 18:00 slot → peak
    expect(resolvePrice([peak, offpeak], baseCtx).priceCents).toBe(4200);
    // 09:00 slot → off-peak
    const morning = { ...baseCtx, slotStartMin: 9 * 60, slotEndMin: 10 * 60 };
    expect(resolvePrice([peak, offpeak], morning).priceCents).toBe(3000);
  });

  it('respects validFrom/validUntil windows', () => {
    const seasonal = rule({
      priceCents: 6000,
      priority: 20,
      validFrom: new Date('2026-06-01T00:00:00Z'),
      validUntil: new Date('2026-09-01T00:00:00Z'),
    });
    const def = rule({ id: 9, priceCents: 3000 });
    expect(resolvePrice([seasonal, def], baseCtx).priceCents).toBe(6000);
    const winter = { ...baseCtx, date: new Date('2026-01-10T15:00:00Z') };
    expect(resolvePrice([seasonal, def], winter).priceCents).toBe(3000);
  });

  it('pro-rates the quoted price to the requested duration', () => {
    const hourly = rule({ priceCents: 4200, durationMin: 60 });
    expect(resolvePrice([hourly], { ...baseCtx, durationMin: 90, slotEndMin: 19 * 60 + 30 }).priceCents).toBe(
      6300,
    );
    expect(resolvePrice([hourly], { ...baseCtx, durationMin: 30 }).priceCents).toBe(2100);
  });

  it('is deterministic when several rules tie on priority and specificity', () => {
    // Two resource rules, same priority; higher id (recency) wins, repeatably.
    const rules = [
      rule({ id: 5, resourceId: 706, priceCents: 4000, priority: 5 }),
      rule({ id: 8, resourceId: 706, priceCents: 4500, priority: 5 }),
      rule({ id: 3, resourceId: 706, priceCents: 3800, priority: 5 }),
    ];
    for (let i = 0; i < 5; i++) {
      const res = resolvePrice([...rules].sort(() => Math.random() - 0.5), baseCtx);
      expect(res.ruleId).toBe(8);
      expect(res.priceCents).toBe(4500);
    }
  });
});
