import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

/** Account/admin screen: kept out of the index so it never competes in search. */
export const metadata: Metadata = NOINDEX;

import { setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { ClubManager } from '@/components/admin/ClubManager';

export default async function AdminClubPage({
  params,
}: {
  params: Promise<{ locale: string; clubId: string }>;
}) {
  const { locale, clubId } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 880, margin: '0 auto', padding: '24px 20px 64px' }}>
        <ClubManager clubId={Number(clubId)} />
      </main>
    </>
  );
}
