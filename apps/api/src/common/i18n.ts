import type { ErrorCode } from '@playslot/contracts';

/**
 * Minimal server-side i18n for API messages (spec §20). Bulgarian is the
 * default (confirmed by the product owner); English is the fallback pair. Web
 * has its own next-intl catalogs; this covers API error + auth strings only.
 */
export type ApiLocale = 'bg' | 'en';

export const API_LOCALES: readonly ApiLocale[] = ['bg', 'en'];
export const DEFAULT_LOCALE: ApiLocale = 'bg';

type MessageKey = ErrorCode | AuthMessageKey;

type AuthMessageKey =
  | 'auth.registered'
  | 'auth.email_verified'
  | 'auth.verification_sent'
  | 'auth.invalid_credentials'
  | 'auth.email_not_verified'
  | 'auth.token_invalid'
  | 'auth.token_expired'
  | 'auth.password_reset'
  | 'auth.reset_sent'
  | 'auth.logged_out'
  | 'auth.email_taken';

const MESSAGES: Record<ApiLocale, Record<MessageKey, string>> = {
  bg: {
    // error contract (§14)
    validation_failed: 'Невалидни данни.',
    unauthenticated: 'Необходимо е удостоверяване.',
    forbidden: 'Нямате достъп до това действие.',
    not_found: 'Ресурсът не е намерен.',
    availability_changed: 'Наличността се промени. Опреснете и опитайте отново.',
    price_mismatch: 'Цената се промени. Опреснете и опитайте отново.',
    hold_expired: 'Резервацията изтече.',
    payment_required: 'Необходимо е плащане.',
    rate_limited: 'Твърде много заявки. Опитайте по-късно.',
    policy_violation: 'Действието нарушава политиката.',
    internal: 'Възникна грешка. Опитайте отново.',
    // auth
    'auth.registered': 'Регистрацията е успешна. Проверете имейла си за потвърждение.',
    'auth.email_verified': 'Имейлът е потвърден.',
    'auth.verification_sent': 'Изпратихме нов имейл за потвърждение.',
    'auth.invalid_credentials': 'Грешен имейл или парола.',
    'auth.email_not_verified': 'Моля, потвърдете имейла си, преди да резервирате.',
    'auth.token_invalid': 'Невалиден или използван код.',
    'auth.token_expired': 'Кодът е изтекъл.',
    'auth.password_reset': 'Паролата е сменена успешно.',
    'auth.reset_sent': 'Ако имейлът съществува, изпратихме връзка за смяна на паролата.',
    'auth.logged_out': 'Излязохте успешно.',
    'auth.email_taken': 'Този имейл вече е регистриран.',
  },
  en: {
    validation_failed: 'Invalid input.',
    unauthenticated: 'Authentication required.',
    forbidden: 'You do not have access to this action.',
    not_found: 'Resource not found.',
    availability_changed: 'Availability changed. Refresh and try again.',
    price_mismatch: 'The price changed. Refresh and try again.',
    hold_expired: 'Your hold expired.',
    payment_required: 'Payment is required.',
    rate_limited: 'Too many requests. Try again later.',
    policy_violation: 'That action violates the policy.',
    internal: 'Something went wrong. Please try again.',
    'auth.registered': 'Registration successful. Check your email to confirm.',
    'auth.email_verified': 'Email verified.',
    'auth.verification_sent': 'We sent a new verification email.',
    'auth.invalid_credentials': 'Wrong email or password.',
    'auth.email_not_verified': 'Please verify your email before booking.',
    'auth.token_invalid': 'Invalid or already-used token.',
    'auth.token_expired': 'The token has expired.',
    'auth.password_reset': 'Your password was changed successfully.',
    'auth.reset_sent': 'If the email exists, we sent a password reset link.',
    'auth.logged_out': 'Signed out.',
    'auth.email_taken': 'That email is already registered.',
  },
};

export function normalizeLocale(input: string | undefined | null): ApiLocale {
  if (!input) return DEFAULT_LOCALE;
  const lower = input.toLowerCase();
  return API_LOCALES.find((l) => lower.startsWith(l)) ?? DEFAULT_LOCALE;
}

export function t(key: MessageKey, locale: ApiLocale = DEFAULT_LOCALE): string {
  return MESSAGES[locale][key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
}
