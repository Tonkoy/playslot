'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { getMe, logout } from '@/lib/api';
import { Avatar } from './Avatar';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';

const linkStyle: React.CSSProperties = {
  color: 'var(--ink-2)',
  fontSize: 15,
  textDecoration: 'none',
  padding: '8px 0',
};

export function SiteNav() {
  const t = useTranslations('Nav');
  const [open, setOpen] = useState(false); // mobile hamburger panel
  const [menuOpen, setMenuOpen] = useState(false); // desktop account/settings dropdown
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const menuRef = useRef<HTMLDivElement>(null);

  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  const signedIn = me.isSuccess;
  const isStaff = me.data?.user.roles.some((r) => r === 'CLUB_ADMIN' || r === 'CLUB_STAFF') ?? false;

  const logoutMut = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      qc.clear();
      setMenuOpen(false);
      setOpen(false);
      router.replace('/');
      router.refresh();
    },
  });

  // Close the desktop dropdown on outside click / Esc / route change.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);
  useEffect(() => setMenuOpen(false), [pathname]);

  const close = () => setOpen(false);

  const links = (
    <>
      <Link href="/clubs" style={linkStyle} onClick={close}>
        {t('clubs')}
      </Link>
      <Link href="/coaches" style={linkStyle} onClick={close}>
        {t('coaches')}
      </Link>
      {isStaff && (
        <Link href="/admin" style={linkStyle} onClick={close}>
          {t('admin')}
        </Link>
      )}
      {signedIn && (
        <Link href="/me/bookings" style={linkStyle} onClick={close}>
          {t('bookings')}
        </Link>
      )}
      {signedIn && (
        <Link href="/me/favorites" style={linkStyle} onClick={close}>
          {t('favorites')}
        </Link>
      )}
    </>
  );

  // Rows shared by the desktop dropdown and the mobile panel.
  const settingsRows = (
    <>
      <div style={menuRow}>
        <span style={menuRowLabel}>{t('theme')}</span>
        <ThemeToggle />
      </div>
      <div style={menuRow}>
        <span style={menuRowLabel}>{t('language')}</span>
        <LanguageSwitcher />
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: primary links inline; account + settings collapsed into a dropdown. */}
      <nav className="nav-desktop" aria-label="Primary">
        {links}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            aria-label={t('menuAria')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 44,
              padding: signedIn ? '0 10px 0 6px' : '0 12px',
              background: 'var(--surface)',
              border: '1px solid var(--line-2)',
              borderRadius: 999,
              color: 'var(--ink)',
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {signedIn ? (
              <>
                <Avatar name={me.data.user.name} size={30} />
                <span aria-hidden style={{ color: 'var(--ink-3)', fontSize: 11 }}>▾</span>
              </>
            ) : (
              <>
                <span aria-hidden style={{ fontSize: 16 }}>⚙</span>
                <span aria-hidden style={{ color: 'var(--ink-3)', fontSize: 11 }}>▾</span>
              </>
            )}
          </button>

          {menuOpen && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                minWidth: 240,
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow)',
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                zIndex: 40,
              }}
            >
              {signedIn && (
                <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--line)', marginBottom: 4 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Avatar name={me.data.user.name} size={36} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {me.data.user.name}
                      </div>
                      <div style={{ color: 'var(--ink-3)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {me.data.user.email}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {signedIn && (
                <Link href="/me" role="menuitem" style={menuItem} onClick={() => setMenuOpen(false)}>
                  {t('account')}
                </Link>
              )}

              {settingsRows}

              {signedIn ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => logoutMut.mutate()}
                  disabled={logoutMut.isPending}
                  style={{
                    ...menuItem,
                    borderTop: '1px solid var(--line)',
                    marginTop: 4,
                    paddingTop: 12,
                    color: 'var(--clay)',
                    fontWeight: 700,
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  {t('logout')}
                </button>
              ) : (
                <Link
                  href="/login"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    ...menuItem,
                    marginTop: 4,
                    background: 'var(--lime)',
                    color: 'var(--on-lime)',
                    fontWeight: 700,
                    textAlign: 'center',
                  }}
                >
                  {t('login')}
                </Link>
              )}
            </div>
          )}
        </div>
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
          {signedIn && (
            <Link href="/me" style={linkStyle} onClick={close}>
              {t('account')}
            </Link>
          )}
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {settingsRows}
          </div>
          <div style={{ marginTop: 8 }}>
            {signedIn ? (
              <button
                type="button"
                onClick={() => logoutMut.mutate()}
                disabled={logoutMut.isPending}
                style={{
                  minHeight: 44,
                  padding: '0 16px',
                  border: '1px solid var(--clay)',
                  background: 'var(--surface)',
                  color: 'var(--clay)',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t('logout')}
              </button>
            ) : (
              <Link
                href="/login"
                onClick={close}
                style={{
                  display: 'inline-flex',
                  minHeight: 44,
                  alignItems: 'center',
                  padding: '0 16px',
                  background: 'var(--lime)',
                  color: 'var(--on-lime)',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                {t('login')}
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const menuItem: React.CSSProperties = {
  display: 'block',
  padding: '10px 10px',
  borderRadius: 'var(--radius-sm)',
  textDecoration: 'none',
  color: 'var(--ink)',
  fontSize: 14,
  border: 'none',
  background: 'transparent',
};
const menuRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '6px 10px',
};
const menuRowLabel: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--ink-2)',
};
