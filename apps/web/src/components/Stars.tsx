'use client';

import { useState } from 'react';

/** Read-only star row, e.g. ★★★★☆. */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const full = Math.round(value);
  return (
    <span aria-label={`${value}/5`} style={{ color: 'var(--held)', letterSpacing: 1, fontSize: size, whiteSpace: 'nowrap' }}>
      {'★'.repeat(full)}
      <span style={{ color: 'var(--line-2)' }}>{'★'.repeat(Math.max(0, 5 - full))}</span>
    </span>
  );
}

/** Clickable 1–5 star picker; keyboard-accessible as a radio group. */
export function StarInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'inline-flex', gap: 2 }} onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}/5`}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 28,
            lineHeight: 1,
            padding: 2,
            minWidth: 36,
            minHeight: 36,
            color: n <= shown ? 'var(--held)' : 'var(--line-2)',
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}
