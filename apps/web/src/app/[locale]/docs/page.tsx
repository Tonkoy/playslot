import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAppLocale } from '@/i18n/routing';
import { pageMetadata } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { PageHeader } from '@/components/PageHeader';
import { Link } from '@/i18n/navigation';

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
    path: '/docs',
    title: t('docs.title'),
    description: t('docs.description'),
  });
}

export default async function DocsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Docs');

  const faqs = [
    { q: t('q1'), a: t('a1') },
    { q: t('q2'), a: t('a2') },
    { q: t('q3'), a: t('a3') },
    { q: t('q4'), a: t('a4') },
    { q: t('q5'), a: t('a5') },
  ];

  // FAQPage: these five Q&As are already on the page, so marking them up is
  // free eligibility for an expandable FAQ rich result.
  const faqGraph = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  return (
    <>
      <JsonLd data={faqGraph} />
      <SiteHeader />
      <main style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '32px 20px 64px' }}>
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 720 }}>
          {faqs.map((item) => (
            <details
              key={item.q}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                padding: '4px 18px',
              }}
            >
              <summary
                style={{
                  padding: '14px 0',
                  fontWeight: 700,
                  fontSize: 15.5,
                  cursor: 'pointer',
                  listStyle: 'none',
                }}
              >
                {item.q}
              </summary>
              <p style={{ color: 'var(--ink-2)', fontSize: 14.5, margin: '0 0 16px' }}>{item.a}</p>
            </details>
          ))}
        </div>

        <div
          style={{
            marginTop: 28,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: 'var(--ink-2)', fontSize: 14.5 }}>{t('contactCta')}</span>
          <Link
            href="/contact"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 18px',
              borderRadius: 'var(--pill)',
              background: 'var(--green-deep)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            {t('contactLink')}
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
