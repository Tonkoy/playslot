'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { getMe, logout } from '@/lib/api';
import { Avatar } from './Avatar';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useSearchModal } from './SearchModalContext';

const linkStyle: React.CSSProperties = {
  color: 'var(--ink-2)',
  fontSize: 15,
  textDecoration: 'none',
  padding: '8px 0',
};

type NavItem = { href: string; label: string; show: boolean };

export function SiteNav() {
  const t = useTranslations('Nav');
  const [open, setOpen] = useState(false); // mobile hamburger panel
  const [menuOpen, setMenuOpen] = useState(false); // desktop account/settings dropdown
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const menuRef = useRef<HTMLDivElement>(null);
  const { openModal } = useSearchModal();

  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  const signedIn = me.isSuccess;
  const isStaff = me.data?.user.roles.some((r) => r === 'CLUB_ADMIN' || r === 'CLUB_STAFF') ?? false;
  const isCoach = me.data?.user.roles.includes('COACH') ?? false;

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

  const navItems: NavItem[] = [
    { href: '/clubs', label: t('clubs'), show: true },
    { href: '/coaches', label: t('coaches'), show: true },
    { href: '/sessions', label: t('sessions'), show: true },
    { href: '/admin', label: t('admin'), show: isStaff },
    { href: '/me/coach', label: t('coachHub'), show: isCoach },
    { href: '/me/schedule', label: t('schedule'), show: isCoach },
    { href: '/me/bookings', label: t('bookings'), show: signedIn },
    { href: '/me/favorites', label: t('favorites'), show: signedIn },
  ].filter((i) => i.show);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Plain vertical list — used in the mobile dropdown panel.
  const mobileLinks = (
    <>
      {navItems.map((item) => (
        <Link key={item.href} href={item.href} style={linkStyle} onClick={close}>
          {item.label}
        </Link>
      ))}
    </>
  );

  // Rows shared by the desktop dropdown and the mobile panel.
  const settingsRows = (
    <>
      <div style={menuRow}>
        <span style={menuRowLabel}>{t('language')}</span>
        <LanguageSwitcher />
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: primary links grouped in a pill, then search / account. */}
      <nav className="nav-desktop" aria-label="Primary">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            background: 'var(--green-soft)',
            padding: 5,
            borderRadius: 'var(--pill)',
            flexWrap: 'wrap',
          }}
        >
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--pill)',
                  fontSize: 13.5,
                  fontWeight: 700,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  background: active ? 'var(--green-deep)' : 'transparent',
                  color: active ? '#fff' : 'var(--ink-2)',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={openModal}
          aria-label={t('searchAria')}
          title={t('searchAria')}
          style={{
            width: 40,
            height: 40,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--green-soft)',
            border: 'none',
            borderRadius: '50%',
            color: 'var(--green-deep)',
            cursor: 'pointer',
            flex: 'none',
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </button>

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
              justifyContent: 'center',
              minWidth: 44,
              minHeight: 44,
              padding: 0,
              background: menuOpen ? 'var(--green-soft)' : 'var(--surface)',
              border: '1px solid var(--line-2)',
              borderRadius: '50%',
              color: 'var(--green-deep)',
              cursor: 'pointer',
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            <span aria-hidden>⋯</span>
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
                    <Avatar name={me.data.user.name} photoUrl={me.data.user.avatarUrl} size={36} />
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
                    borderRadius: 'var(--pill)',
                  }}
                >
                  {t('login')}
                </Link>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Mobile: search + hamburger toggle */}
      <div style={{ marginLeft: 'auto', alignItems: 'center', gap: 8 }} className="nav-burger">
        <button
          type="button"
          onClick={openModal}
          aria-label={t('searchAria')}
          title={t('searchAria')}
          style={{
            minWidth: 44,
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface)',
            border: '1px solid var(--line-2)',
            borderRadius: '50%',
            color: 'var(--green-deep)',
            cursor: 'pointer',
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={t('menu')}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          style={{
            minWidth: 44,
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface)',
            border: '1px solid var(--line-2)',
            borderRadius: '50%',
            color: 'var(--green-deep)',
            fontSize: 20,
            cursor: 'pointer',
          }}
        >
          {open ? '✕' : '☰'}
        </button>
      </div>

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
          {mobileLinks}
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
                  borderRadius: 'var(--pill)',
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
                  borderRadius: 'var(--pill)',
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
