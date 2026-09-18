import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

/** Account/admin screen: kept out of the index so it never competes in search. */
export const metadata: Metadata = NOINDEX;

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { PageHeader } from '@/components/PageHeader';

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('ForgotPassword');
  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '48px 20px' }}>
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} align="center" />
        <ForgotPasswordForm />
      </main>
    </>
  );
}
