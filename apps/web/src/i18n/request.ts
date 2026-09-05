import { getRequestConfig } from 'next-intl/server';
import { isAppLocale, routing } from './routing';

// Loads the message catalog for the active locale on the server (spec §20).
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isAppLocale(requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
