import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAppLocale } from '@/i18n/routing';
import { pageMetadata } from '@/lib/seo';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { PageHeader } from '@/components/PageHeader';

const SUPPORT_EMAIL = 'support@playslot.bg';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'Seo' });
  return pageMetadata({
    locale,
    path: '/contact',
    title: t('contact.title'),
    description: t('contact.description'),
  });
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Contact');

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '32px 20px 64px' }}>
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-sm)',
            padding: 28,
            maxWidth: 480,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            {t('emailLabel')}
          </div>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 10,
              fontWeight: 700,
              fontSize: 20,
              color: 'var(--green-deep)',
              textDecoration: 'none',
            }}
          >
            {SUPPORT_EMAIL}
          </a>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 14 }}>{t('responseNote')}</p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
