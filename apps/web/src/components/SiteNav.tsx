'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { LanguageSwitcher } from './LanguageSwitcher';

const linkStyle: React.CSSProperties = {
  color: 'var(--ink-2)',
  fontSize: 15,
  textDecoration: 'none',
  padding: '8px 0',
};

export function SiteNav() {
  const t = useTranslations('Nav');
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile menu whenever the route changes.
  const links = (
    <>
      <Link href="/clubs" style={linkStyle} onClick={() => setOpen(false)}>
        {t('clubs')}
      </Link>
      <Link href="/coaches" style={linkStyle} onClick={() => setOpen(false)}>
        {t('coaches')}
      </Link>
      <Link href="/admin" style={linkStyle} onClick={() => setOpen(false)}>
        {t('admin')}
      </Link>
      <Link href="/me/bookings" style={linkStyle} onClick={() => setOpen(false)}>
        {t('bookings')}
      </Link>
      <Link href="/me/favorites" style={linkStyle} onClick={() => setOpen(false)}>
        {t('favorites')}
      </Link>
    </>
  );

  return (
    <>
      {/* Desktop: inline links + language */}
      <nav className="nav-desktop" aria-label="Primary">
        {links}
        <LanguageSwitcher />
      </nav>

      {/* Mobile: hamburger toggle */}
      <button
        type="button"
        className="nav-burger"
        aria-label={t('menu')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          marginLeft: 'auto',
          minWidth: 44,
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--surface)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--ink)',
          fontSize: 20,
          cursor: 'pointer',
        }}
      >
        {open ? '✕' : '☰'}
      </button>

      {/* Mobile dropdown panel (hidden on desktop via CSS) */}
      {open && (
        <div
          key={pathname}
          className="nav-mobile-panel"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'var(--surface)',
            borderBottom: '1px solid var(--line)',
            boxShadow: 'var(--shadow)',
            padding: '12px 20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            zIndex: 20,
          }}
        >
          {links}
          <div style={{ marginTop: 6 }}>
            <LanguageSwitcher />
          </div>
        </div>
      )}
    </>
  );
}
