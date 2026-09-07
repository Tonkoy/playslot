import { setRequestLocale } from 'next-intl/server';
import { AccountClient } from '@/components/AccountClient';
import { SiteHeader } from '@/components/SiteHeader';

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 64px' }}>
        <AccountClient />
      </main>
    </>
  );
}
