import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

/** Account/admin screen: kept out of the index so it never competes in search. */
export const metadata: Metadata = NOINDEX;

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { VerifyEmail } from '@/components/auth/VerifyEmail';
import { PageHeader } from '@/components/PageHeader';

export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('VerifyEmail');
  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '48px 20px' }}>
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} align="center" />
        <VerifyEmail token={token ?? ''} />
      </main>
    </>
  );
}
