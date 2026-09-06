'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { verifyEmail } from '@/lib/api';
import { authPrimaryBtn } from './styles';

export function VerifyEmail({ token }: { token: string }) {
  const t = useTranslations('VerifyEmail');
  const [state, setState] = useState<'pending' | 'ok' | 'error'>(token ? 'pending' : 'error');
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // guard React 18 StrictMode double-invoke
    verifyEmail(token)
      .then(() => setState('ok'))
      .catch(() => setState('error'));
  }, [token]);

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', textAlign: 'center' }}>
      {state === 'pending' && <p style={{ color: 'var(--ink-3)' }}>{t('verifying')}</p>}
      {state === 'ok' && (
        <>
          <p style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>{t('ok')}</p>
          <Link href="/login" style={{ ...authPrimaryBtn, display: 'inline-block', lineHeight: '46px', textDecoration: 'none' }}>
            {t('toLogin')}
          </Link>
        </>
      )}
      {state === 'error' && <p style={{ color: 'var(--clay)' }}>{t('error')}</p>}
    </div>
  );
}
