import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

/** Account/admin screen: kept out of the index so it never competes in search. */
export const metadata: Metadata = NOINDEX;

import { setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { redirect } from '@/i18n/navigation';
import { getServerSession } from '@/lib/session.server';

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Already signed in: no second account to create.
  if (await getServerSession()) redirect({ href: '/', locale });
  // The heading lives inside the form: once the account is created the form
  // swaps to the confirmation panel, and "Регистрация / Създайте акаунт…"
  // above it would still be telling the user to do what they just did.
  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '48px 20px' }}>
        <RegisterForm />
      </main>
    </>
  );
}
