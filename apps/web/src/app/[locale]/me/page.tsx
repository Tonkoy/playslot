import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

/** Account/admin screen: kept out of the index so it never competes in search. */
export const metadata: Metadata = NOINDEX;

import { setRequestLocale } from 'next-intl/server';
import { AccountClient } from '@/components/AccountClient';
import { SiteHeader } from '@/components/SiteHeader';

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 20px 64px' }}>
        <AccountClient />
      </main>
    </>
  );
}
