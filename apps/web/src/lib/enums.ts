/**
 * Labels for API enum values (QA-16). The API speaks codes — TENNIS, CLAY,
 * ACTIVE, LESSON — and those must never reach the screen; every one has a bg
 * and en label under the `Enums` namespace. `scripts/check-enum-labels.mjs`
 * fails the build when a new enum value arrives without translations.
 */

export type EnumKind = 'Sport' | 'Surface' | 'ClubStatus' | 'ReservationType' | 'Role' | 'Language';

/** The shape both `useTranslations` (client) and `getTranslations` (server) share. */
export interface EnumTranslator {
  (key: string): string;
  has(key: string): boolean;
}

/**
 * `enumLabel(t, 'Sport', 'TABLE_TENNIS')` → "Тенис на маса". An unknown value
 * falls back to the code itself: a missing translation must not blank the UI.
 */
export function enumLabel(
  t: EnumTranslator,
  kind: EnumKind,
  value: string | null | undefined,
): string {
  if (!value) return '';
  const key = `${kind}.${value}`;
  return t.has(key) ? t(key) : value;
}
