import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Where the browser's /api calls are forwarded. The site talks to the API
 * through itself, so the session cookie is set on — and read from — the
 * site's own host: the site's server can see who is signed in on the first
 * render, and no cookie has to be shared across subdomains.
 */
const API_PROXY_TARGET = (
  process.env.API_PROXY_TARGET ??
  process.env.API_BASE_URL ??
  'http://localhost:3001'
).replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_PROXY_TARGET}/api/:path*` }];
  },
  transpilePackages: ['@playslot/contracts', '@playslot/domain'],
  // Linting runs as its own turbo task (`pnpm lint`); keep it out of `next build`.
  eslint: { ignoreDuringBuilds: true },
};

export default withNextIntl(nextConfig);
