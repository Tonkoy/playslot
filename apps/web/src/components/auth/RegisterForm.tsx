'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { googleLoginUrl, register } from '@/lib/api';
import { authInput, authLabel, authPrimaryBtn, googleBtn } from './styles';

export function RegisterForm() {
  const t = useTranslations('Register');
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [subscribe, setSubscribe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t('passwordMismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register({ name, email, password, confirm, acceptTerms: true, subscribe });
      await qc.invalidateQueries({ queryKey: ['me'] });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
        <p style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{t('successTitle')}</p>
        <p style={{ color: 'var(--ink-2)', marginBottom: 20 }}>{t('successBody')}</p>
        <button type="button" onClick={() => router.push('/clubs')} style={authPrimaryBtn}>
          {t('browseClubs')}
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label style={authLabel}>
          {t('name')}
          <input value={name} onChange={(e) => setName(e.target.value)} required style={authInput} autoComplete="name" />
        </label>
        <label style={authLabel}>
          {t('email')}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={authInput} autoComplete="email" />
        </label>
        <label style={authLabel}>
          {t('password')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} style={authInput} autoComplete="new-password" />
        </label>
        <label style={authLabel}>
          {t('confirm')}
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required style={authInput} autoComplete="new-password" />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, color: 'var(--ink-2)' }}>
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required style={{ marginTop: 3 }} />
          {t('acceptTerms')}
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
  );
}
