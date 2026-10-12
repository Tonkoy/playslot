'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { googleLoginUrl, register } from '@/lib/api';
import { errorMessage, fieldErrorsOf } from '@/lib/errors';
import { FieldError } from '../FieldError';
import { PageHeader } from '../PageHeader';
import { SuccessMark } from '../SuccessMark';
import { PasswordInput } from './PasswordInput';
import { authInput, authLabel, authPrimaryBtn, googleBtn } from './styles';

export function RegisterForm() {
  const t = useTranslations('Register');
  const te = useTranslations('Errors');
  const tt = useTranslations('Toasts');
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [subscribe, setSubscribe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-field codes from the API ({ password: ['password_upper', …] }).
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFields({});
    if (password !== confirm) {
      setFields({ confirm: ['password_mismatch'] });
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register({ name, email, password, confirm, acceptTerms: true, subscribe });
      await qc.invalidateQueries({ queryKey: ['me'] });
      setDone(true);
    } catch (err) {
      // Validation errors belong under their fields; anything else is a banner.
      const perField = fieldErrorsOf(err);
      setFields(perField);
      setError(Object.keys(perField).length > 0 ? null : errorMessage(err, te, tt('error')));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      // With the page header gone, this panel is the page: the confirmation
      // carries the heading weight itself.
      <div style={{ maxWidth: 440, margin: '24px auto 0', textAlign: 'center' }}>
        <SuccessMark />
        <h1 style={{ fontSize: 'clamp(22px, 3.2vw, 30px)', fontWeight: 800, margin: '18px 0 10px' }}>
          {t('successTitle')}
        </h1>
        <p style={{ color: 'var(--ink-2)', marginBottom: 20 }}>{t('successBody')}</p>
        <button type="button" onClick={() => router.push('/clubs')} style={authPrimaryBtn}>
          {t('browseClubs')}
        </button>
      </div>
    );
  }

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} align="center" />
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label style={authLabel}>
          {t('name')}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={authInput}
            autoComplete="name"
            aria-invalid={Boolean(fields.name)}
          />
          <FieldError codes={fields.name} />
        </label>
        <label style={authLabel}>
          {t('email')}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={authInput}
            autoComplete="email"
            aria-invalid={Boolean(fields.email)}
          />
          <FieldError codes={fields.email} />
        </label>
        <label style={authLabel}>
          {t('password')}
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            aria-invalid={Boolean(fields.password)}
            aria-describedby="password-rules"
          />
          {/* The rules up front, so the first failure isn't a surprise. */}
          <span id="password-rules" style={{ color: 'var(--ink-3)', fontSize: 12.5, marginTop: 4 }}>
            {t('passwordHint')}
          </span>
          <FieldError codes={fields.password} />
        </label>
        <label style={authLabel}>
          {t('confirm')}
          <PasswordInput
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            aria-invalid={Boolean(fields.confirm)}
          />
          <FieldError codes={fields.confirm} />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, color: 'var(--ink-2)' }}>
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required style={{ marginTop: 3 }} />
          <span>
            {t('acceptTerms')}
            <FieldError codes={fields.acceptTerms} />
          </span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, color: 'var(--ink-2)' }}>
          <input type="checkbox" checked={subscribe} onChange={(e) => setSubscribe(e.target.checked)} style={{ marginTop: 3 }} />
          {t('subscribe')}
        </label>

        {error && (
          <div role="alert" style={{ color: 'var(--clay)', fontSize: 14 }}>
            {error}
          </div>
        )}
        <button type="submit" disabled={busy || !terms} style={authPrimaryBtn}>
          {busy ? '…' : t('submit')}
        </button>
      </form>

      <div style={{ textAlign: 'center', color: 'var(--ink-3)', margin: '16px 0', fontSize: 13 }}>{t('or')}</div>
      <a href={googleLoginUrl('/me/bookings')} style={googleBtn}>
        {t('google')}
      </a>
      <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--ink-2)' }}>
        {t('haveAccount')} <Link href="/login" style={{ color: 'var(--teal)' }}>{t('logIn')}</Link>
      </p>
      </div>
    </>
  );
}
