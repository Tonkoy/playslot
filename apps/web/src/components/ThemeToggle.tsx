'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type ThemeChoice = 'system' | 'light' | 'dark';
const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];
const ICON: Record<ThemeChoice, string> = { system: '🖥', light: '☀', dark: '🌙' };

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', choice);
  } catch {
    /* storage blocked — the in-memory choice still applies for this session */
  }
}

/** Cycle system → light → dark. Persists to localStorage; the pre-paint script
 * in the layout reads it back on the next load. */
export function ThemeToggle() {
  const t = useTranslations('Nav');
  const [choice, setChoice] = useState<ThemeChoice>('system');

  // Hydrate from what the pre-paint script already applied.
  useEffect(() => {
    let saved: ThemeChoice = 'system';
    try {
      const v = localStorage.getItem('theme');
      if (v === 'light' || v === 'dark') saved = v;
    } catch {
      /* ignore */
    }
    setChoice(saved);
  }, []);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]!;
    setChoice(next);
    apply(next);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={t('themeLabel', { mode: t(`theme_${choice}`) })}
      title={t('themeLabel', { mode: t(`theme_${choice}`) })}
      style={{
        minWidth: 44,
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        background: 'var(--surface)',
        border: '1px solid var(--line-2)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--ink)',
        cursor: 'pointer',
        fontSize: 16,
      }}
    >
      <span aria-hidden>{ICON[choice]}</span>
    </button>
  );
}
