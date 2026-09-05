import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { BrandMark } from './BrandMark';
import { LanguageSwitcher } from './LanguageSwitcher';

export function SiteHeader() {
  const t = useTranslations('Nav');
  const c = useTranslations('Common');

  return (
    <header
      style={{
        borderBottom: '1px solid var(--line)',
        background: 'var(--surface)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
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

        <nav
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 18 }}
          aria-label="Primary"
        >
          <Link href="/clubs" style={{ color: 'var(--ink-2)', fontSize: 14, textDecoration: 'none' }}>
            {t('clubs')}
          </Link>
          <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('coaches')}</span>
          <Link href="/admin" style={{ color: 'var(--ink-2)', fontSize: 14, textDecoration: 'none' }}>
            {t('admin')}
          </Link>
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}
