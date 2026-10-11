'use client';

import { useTranslations } from 'next-intl';

/**
 * The validation messages for one form field. The API sends codes
 * ("password_upper"), never sentences, so the text is always in the user's
 * language — and an unknown code degrades to a generic line instead of
 * leaking an English zod default.
 */
export function FieldError({ codes }: { codes?: string[] }) {
  const t = useTranslations('FieldErrors');
  if (!codes || codes.length === 0) return null;
  return (
    <span role="alert" style={{ display: 'grid', gap: 2, marginTop: 4 }}>
      {codes.map((code) => (
        <span key={code} style={{ color: 'var(--clay)', fontSize: 13 }}>
          {t.has(code) ? t(code) : t('invalid')}
        </span>
      ))}
    </span>
  );
}
