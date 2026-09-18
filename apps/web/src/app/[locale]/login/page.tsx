import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

/** Account/admin screen: kept out of the index so it never competes in search. */
export const metadata: Metadata = NOINDEX;

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { LoginForm } from '@/components/auth/LoginForm';
import { PageHeader } from '@/components/PageHeader';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { locale } = await params;
  const { returnTo } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('Login');

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '48px 20px' }}>
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} align="center" />
        <LoginForm locale={locale} returnTo={returnTo ?? '/'} />
      </main>
    </>
  );
}
