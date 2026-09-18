import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { Bricolage_Grotesque, Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import { isAppLocale, routing } from '@/i18n/routing';
import { ALLOW_INDEXING, SITE_NAME, SITE_URL, alternatesFor, socialFor } from '@/lib/seo';
import { Providers } from '@/components/Providers';
import '../globals.css';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-bricolage',
  display: 'swap',
});

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-hanken',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

/**
 * Site-wide metadata, resolved per locale. Individual pages override `title`
 * and `description`; everything else here (title template, canonical host,
 * hreflang, social cards, crawler directives) applies to the whole tree.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'Seo' });
  const title = t('home.title');
  const description = t('home.description');

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      // Page titles render as "<page> | PlaySlot"; the home page overrides
      // this with an absolute title so the brand isn't doubled.
      default: `${title} | ${SITE_NAME}`,
      template: `%s | ${SITE_NAME}`,
    },
    description,
    applicationName: SITE_NAME,
    alternates: alternatesFor(locale, ''),
    ...socialFor({ locale, title, description }),
    robots: {
      index: ALLOW_INDEXING,
      follow: ALLOW_INDEXING,
      googleBot: {
        index: ALLOW_INDEXING,
        follow: ALLOW_INDEXING,
        'max-snippet': -1,
        'max-image-preview': 'large',
        'max-video-preview': -1,
      },
    },
    formatDetection: { telephone: false },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${bricolage.variable} ${hanken.variable} ${plexMono.variable}`}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
