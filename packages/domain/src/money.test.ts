import { describe, expect, it } from 'vitest';
import {
  addMoney,
  formatMoney,
  money,
  MoneyError,
  multiplyMoney,
  percentOf,
  priceForDuration,
  subtractMoney,
} from './money';

describe('money', () => {
  it('rejects non-integer minor units', () => {
    expect(() => money(42.5, 'EUR')).toThrow(MoneyError);
  });

  it('normalises currency to uppercase', () => {
    expect(money(100, 'eur').currency).toBe('EUR');
  });

  it('adds and subtracts within the same currency', () => {
    expect(addMoney(money(4200, 'EUR'), money(800, 'EUR')).amountCents).toBe(5000);
    expect(subtractMoney(money(4200, 'EUR'), money(200, 'EUR')).amountCents).toBe(4000);
  });

  it('refuses cross-currency arithmetic', () => {
    expect(() => addMoney(money(100, 'EUR'), money(100, 'BGN'))).toThrow(MoneyError);
  });

  it('multiplies by whole quantities only', () => {
    expect(multiplyMoney(money(4200, 'EUR'), 2).amountCents).toBe(8400);
    expect(() => multiplyMoney(money(4200, 'EUR'), 1.5)).toThrow(MoneyError);
  });
});

describe('percentOf (refund tiers)', () => {
  it('computes 50% with half-up rounding', () => {
    expect(percentOf(money(4200, 'EUR'), 50).amountCents).toBe(2100);
    expect(percentOf(money(4201, 'EUR'), 50).amountCents).toBe(2101); // 2100.5 → 2101
  });

  it('returns full and zero refunds at the bounds', () => {
    expect(percentOf(money(4200, 'EUR'), 100).amountCents).toBe(4200);
    expect(percentOf(money(4200, 'EUR'), 0).amountCents).toBe(0);
  });
});

describe('priceForDuration', () => {
  it('pro-rates an hourly rate', () => {
    expect(priceForDuration(4200, 60)).toBe(4200);
    expect(priceForDuration(4200, 90)).toBe(6300);
    expect(priceForDuration(4200, 30)).toBe(2100);
  });
});

describe('formatMoney', () => {
  it('formats for display only', () => {
    // Non-breaking spaces vary by ICU; assert the numeric core is present.
    expect(formatMoney(money(4200, 'EUR'), 'en-US')).toContain('42.00');
  });
});
