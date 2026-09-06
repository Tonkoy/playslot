'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { googleLoginUrl, login } from '@/lib/api';

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
      router.push(returnTo.startsWith('/') ? returnTo : '/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label style={labelStyle}>
          {t('email')}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            autoComplete="email"
          />
        </label>
        <label style={labelStyle}>
          {t('password')}
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            autoComplete="current-password"
          />
        </label>

        {error && (
          <div role="alert" style={{ color: 'var(--clay)', fontSize: 14 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={busy} style={primaryBtn}>
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

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  fontSize: 14,
  color: 'var(--ink-2)',
};
const inputStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '0 12px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
  fontSize: 15,
};
const primaryBtn: React.CSSProperties = {
  minHeight: 46,
  background: 'var(--lime)',
  color: 'var(--on-lime)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 15,
};
const googleBtn: React.CSSProperties = {
  display: 'block',
  textAlign: 'center',
  minHeight: 46,
  lineHeight: '46px',
  background: 'var(--surface)',
  color: 'var(--ink)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 600,
  textDecoration: 'none',
};
