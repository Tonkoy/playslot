import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

/** Account/admin screen: kept out of the index so it never competes in search. */
export const metadata: Metadata = NOINDEX;

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AccountClient } from '@/components/AccountClient';
import { SiteHeader } from '@/components/SiteHeader';

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Account');

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 64px' }}>
        <span
          className="mono"
          style={{
            display: 'inline-flex',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--green)',
            marginBottom: 16,
          }}
        >
          {t('eyebrow')}
        </span>
        <AccountClient />
      </main>
    </>
  );
}
