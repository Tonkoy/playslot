'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { resetPassword } from '@/lib/api';
import { authInput, authLabel, authPrimaryBtn } from './styles';

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('ResetPassword');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return <p style={{ color: 'var(--clay)', textAlign: 'center' }}>{t('missingToken')}</p>;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t('mismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 400, margin: '0 auto', textAlign: 'center' }}>
        <p style={{ color: 'var(--ink-2)', marginBottom: 16 }}>{t('success')}</p>
        <button type="button" onClick={() => router.push('/login')} style={authPrimaryBtn}>
          {t('toLogin')}
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label style={authLabel}>
          {t('newPassword')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} style={authInput} autoComplete="new-password" />
        </label>
        <label style={authLabel}>
          {t('confirm')}
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required style={authInput} autoComplete="new-password" />
        </label>
        {error && <div role="alert" style={{ color: 'var(--clay)', fontSize: 14 }}>{error}</div>}
        <button type="submit" disabled={busy} style={authPrimaryBtn}>
          {busy ? '…' : t('submit')}
        </button>
      </form>
      <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14 }}>
        <Link href="/login" style={{ color: 'var(--teal)' }}>{t('backToLogin')}</Link>
      </p>
    </div>
  );
}
