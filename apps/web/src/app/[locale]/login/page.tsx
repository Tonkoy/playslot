import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { LoginForm } from '@/components/auth/LoginForm';

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
        <h1 style={{ fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 800, textAlign: 'center' }}>
          {t('title')}
        </h1>
        <p style={{ color: 'var(--ink-2)', textAlign: 'center', margin: '8px 0 28px' }}>
          {t('subtitle')}
        </p>
        <LoginForm locale={locale} returnTo={returnTo ?? '/admin'} />
      </main>
    </>
  );
}
