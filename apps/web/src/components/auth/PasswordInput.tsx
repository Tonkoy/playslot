'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { authInput } from './styles';

/**
 * Password field with a show/hide eye. The toggle is a real button (keyboard
 * reachable, announced by screen readers) but never takes focus away from the
 * field on click, so typing continues where it left off.
 */
export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const c = useTranslations('Common');
  const [shown, setShown] = useState(false);
  const label = shown ? c('hidePassword') : c('showPassword');

  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <input
        {...props}
        type={shown ? 'text' : 'password'}
        style={{ ...authInput, display: 'block', width: '100%', paddingRight: 44, boxSizing: 'border-box' }}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        onMouseDown={(e) => e.preventDefault()}
        aria-label={label}
        aria-pressed={shown}
        title={label}
        style={{
          position: 'absolute',
          right: 4,
          top: 0,
          height: 44,
          width: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--ink-3)',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <EyeIcon off={shown} />
      </button>
    </span>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1.8 12S5.5 5.5 12 5.5 22.2 12 22.2 12 18.5 18.5 12 18.5 1.8 12 1.8 12Z" />
      <circle cx="12" cy="12" r="3.2" />
      {off && <line x1="4" y1="20" x2="20" y2="4" />}
    </svg>
  );
}
