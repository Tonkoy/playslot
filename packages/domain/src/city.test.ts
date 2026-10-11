import { describe, expect, it } from 'vitest';
import { cityDisplayName, citySlug } from './city';

describe('citySlug', () => {
  it('maps the Bulgarian and Latin spellings of a city to one slug', () => {
    expect(citySlug('София')).toBe('sofia');
    expect(citySlug('Sofia')).toBe('sofia');
    expect(citySlug(' sofia ')).toBe('sofia');
    expect(citySlug('СОФИЯ')).toBe('sofia');
  });

  it('handles multi-letter Bulgarian characters', () => {
    expect(citySlug('Велико Търново')).toBe('veliko-tarnovo');
    expect(citySlug('Veliko Tarnovo')).toBe('veliko-tarnovo');
    expect(citySlug('Пловдив')).toBe('plovdiv');
    expect(citySlug('Шумен')).toBe('shumen');
    expect(citySlug('Стара Загора')).toBe('stara-zagora');
    expect(citySlug('Благоевград')).toBe('blagoevgrad');
    // Word-final "-ия" is "-ia"; "я" elsewhere stays "ya".
    expect(citySlug('樂')).toBe('');
    expect(citySlug('Ямбол')).toBe('yambol');
  });

  it('is stable for a slug it already produced', () => {
    const once = citySlug('Велико Търново');
    expect(citySlug(once)).toBe(once);
  });

  it('returns an empty slug when there is nothing usable', () => {
    expect(citySlug('   ')).toBe('');
    expect(citySlug('!!!')).toBe('');
  });
});

describe('cityDisplayName', () => {
  it('trims and collapses whitespace', () => {
    expect(cityDisplayName('  Велико   Търново ')).toBe('Велико Търново');
  });
});
