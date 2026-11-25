'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { getMe, googleLoginUrl, login } from '@/lib/api';
import { errorMessage, fieldErrorsOf } from '@/lib/errors';
import { FieldError } from '../FieldError';
import { PasswordInput } from './PasswordInput';
import { GoogleMark } from './GoogleMark';
import { authInput, authLabel, authPrimaryBtn, googleBtn } from './styles';
import { BusyLabel } from '@/components/Spinner';

export function LoginForm({ locale, returnTo }: { locale: string; returnTo: string }) {
  const t = useTranslations('Login');
  const te = useTranslations('Errors');
  const tt = useTranslations('Toasts');
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  // The page redirects a signed-in visitor on the server; this covers the ways
  // back that never reach the server — the Back button and cached pages. One
  // exit for both cases, and `replace`, so Back never lands on this form again.
  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  const left = useRef(false);
  const leave = useCallback(() => {
    if (left.current) return;
    left.current = true;
    router.replace(returnTo);
  }, [router, returnTo]);
  useEffect(() => {
    if (me.isSuccess) leave();
  }, [me.isSuccess, leave]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      await qc.invalidateQueries({ queryKey: ['me'] });
      leave();
    } catch (err) {
      const perField = fieldErrorsOf(err);
      setFields(perField);
      setError(Object.keys(perField).length > 0 ? null : errorMessage(err, te, tt('error')));
    } finally {
      setBusy(false);
    }
  }

  // Signed in and on the way out: don't flash a form nobody should fill in.
  if (me.isSuccess) return null;

  return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label style={authLabel}>
          {t('email')}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={authInput}
            autoComplete="email"
            aria-invalid={Boolean(fields.email)}
          />
          <FieldError codes={fields.email} />
        </label>
        <label style={authLabel}>
          {t('password')}
          <PasswordInput
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            aria-invalid={Boolean(fields.password)}
          />
          <FieldError codes={fields.password} />
        </label>

        {error && (
          <div role="alert" style={{ color: 'var(--clay)', fontSize: 14 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={busy} style={authPrimaryBtn}>
          <BusyLabel busy={busy}>{t('submit')}</BusyLabel>
        </button>
      </form>

      <div style={{ textAlign: 'center', color: 'var(--ink-3)', margin: '16px 0', fontSize: 13 }}>
        {t('or')}
      </div>

      <a href={googleLoginUrl(returnTo)} style={googleBtn}>
        <GoogleMark />
        {t('google')}
      </a>

      {/* Wraps onto two lines on a phone instead of the links touching. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: '4px 24px',
          marginTop: 20,
          fontSize: 14,
        }}
      >
        <Link href="/register" style={{ color: 'var(--teal)', padding: '8px 0' }}>
          {t('signUp')}
        </Link>
        <Link href="/forgot-password" style={{ color: 'var(--ink-3)', padding: '8px 0' }}>
          {t('forgot')}
        </Link>
      </div>
    </div>
  );
}

