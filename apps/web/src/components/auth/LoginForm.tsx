'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { googleLoginUrl, login } from '@/lib/api';
import { authInput, authLabel, authPrimaryBtn, googleBtn } from './styles';

export function LoginForm({ locale, returnTo }: { locale: string; returnTo: string }) {
  const t = useTranslations('Login');
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.push(returnTo.startsWith('/') ? returnTo : '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

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
          />
        </label>
        <label style={authLabel}>
          {t('password')}
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={authInput}
            autoComplete="current-password"
          />
        </label>

        {error && (
          <div role="alert" style={{ color: 'var(--clay)', fontSize: 14 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={busy} style={authPrimaryBtn}>
          {busy ? '…' : t('submit')}
        </button>
      </form>

      <div style={{ textAlign: 'center', color: 'var(--ink-3)', margin: '16px 0', fontSize: 13 }}>
        {t('or')}
      </div>

      <a href={googleLoginUrl(returnTo)} style={googleBtn}>
        {t('google')}
      </a>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 14 }}>
        <Link href="/register" style={{ color: 'var(--teal)' }}>
          {t('signUp')}
        </Link>
        <Link href="/forgot-password" style={{ color: 'var(--ink-3)' }}>
          {t('forgot')}
        </Link>
      </div>
    </div>
  );
}

