import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@playslot/contracts', '@playslot/domain'],
  // Linting runs as its own turbo task (`pnpm lint`); keep it out of `next build`.
  eslint: { ignoreDuringBuilds: true },
};

export default withNextIntl(nextConfig);
