/**
 * Money is always integer minor units (cents) — never floats (golden rule §2.6).
 * These helpers keep that invariant explicit at every boundary. Currency codes
 * are ISO-4217 uppercase strings; the default is configurable per club.
 */

export type CurrencyCode = string; // ISO-4217, e.g. "EUR", "BGN"

export interface Money {
  readonly amountCents: number;
  readonly currency: CurrencyCode;
}

export class MoneyError extends Error {}

function assertInteger(amountCents: number): void {
  if (!Number.isInteger(amountCents)) {
    throw new MoneyError(`amountCents must be an integer (minor units), got ${amountCents}`);
  }
}

export function money(amountCents: number, currency: CurrencyCode): Money {
  assertInteger(amountCents);
  if (currency.length !== 3) {
    throw new MoneyError(`currency must be a 3-letter ISO code, got "${currency}"`);
  }
  return { amountCents, currency: currency.toUpperCase() };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountCents + b.amountCents, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountCents - b.amountCents, a.currency);
}

/**
 * Multiply a unit price by a whole quantity (e.g. hourly rate × hours).
 * Quantity must be an integer to keep the result exact.
 */
export function multiplyMoney(a: Money, quantity: number): Money {
  if (!Number.isInteger(quantity)) {
    throw new MoneyError(`quantity must be an integer, got ${quantity}`);
  }
  return money(a.amountCents * quantity, a.currency);
}

/**
 * Apply a percentage (0–100) and round half-up to the nearest cent. Used by the
 * cancellation-refund tiers (spec §12): e.g. 50% of 4200 → 2100.
 */
export function percentOf(a: Money, percent: number): Money {
  if (percent < 0 || percent > 100) {
    throw new MoneyError(`percent must be within [0, 100], got ${percent}`);
  }
  const raw = (a.amountCents * percent) / 100;
  return money(Math.round(raw), a.currency);
}

/** Pro-rate an hourly price to a duration in minutes, rounding half-up. */
export function priceForDuration(hourlyCents: number, durationMin: number): number {
  assertInteger(hourlyCents);
  if (durationMin <= 0 || !Number.isInteger(durationMin)) {
    throw new MoneyError(`durationMin must be a positive integer, got ${durationMin}`);
  }
  return Math.round((hourlyCents * durationMin) / 60);
}

/** Human-readable formatting for display only — never for computation. */
export function formatMoney(m: Money, locale = 'bg-BG'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
  }).format(m.amountCents / 100);
}
