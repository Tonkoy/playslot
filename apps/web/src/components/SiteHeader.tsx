import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { BrandMark } from './BrandMark';
import { SiteNav } from './SiteNav';

export function SiteHeader() {
  const c = useTranslations('Common');

  return (
    <header
      style={{
        borderBottom: '1px solid var(--line)',
        background: 'var(--surface)',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      <div
        style={{
          maxWidth: 'var(--maxw)',
          margin: '0 auto',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          position: 'relative',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 11,
            textDecoration: 'none',
            color: 'var(--ink)',
          }}
        >
          <BrandMark />
          <span
            style={{
              fontFamily: 'var(--font-bricolage), system-ui, sans-serif',
              fontWeight: 800,
              fontSize: 22,
              letterSpacing: '-0.03em',
            }}
          >
            {c('appName')}
          </span>
        </Link>

        <SiteNav />
      </div>
    </header>
  );
}
