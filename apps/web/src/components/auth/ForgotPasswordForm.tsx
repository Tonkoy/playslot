'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { requestPasswordReset } from '@/lib/api';
import { authInput, authLabel, authPrimaryBtn } from './styles';

export function ForgotPasswordForm() {
  const t = useTranslations('ForgotPassword');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      {done ? (
        <p style={{ color: 'var(--ink-2)', textAlign: 'center' }}>{t('sent')}</p>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
          <label style={authLabel}>
            {t('email')}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={authInput} autoComplete="email" />
          </label>
          <button type="submit" disabled={busy} style={authPrimaryBtn}>
            {busy ? '…' : t('submit')}
          </button>
        </form>
      )}
      <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14 }}>
        <Link href="/login" style={{ color: 'var(--teal)' }}>{t('backToLogin')}</Link>
      </p>
    </div>
  );
}
