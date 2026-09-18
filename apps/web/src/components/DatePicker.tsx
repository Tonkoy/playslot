'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parse(v: string): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}
/** Monday-first weekday index (0=Mon … 6=Sun). */
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;

const POPOVER_WIDTH = 280;

/**
 * Accessible popover calendar date picker (no dependencies). Emits a
 * `YYYY-MM-DD` string; days before `min` are disabled.
 *
 * The popover is rendered through a portal into `document.body` and
 * positioned with `position: fixed`, computed from the trigger button's
 * bounding rect. This lets it escape any scrollable/clipping ancestor (e.g.
 * a modal card with `overflow: auto`) instead of being cut off by it.
 */
export function DatePicker({
  value,
  onChange,
  locale,
  min,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  locale: string;
  min?: string; // YYYY-MM-DD (inclusive); defaults to today
  placeholder?: string;
}) {
  const loc = locale === 'bg' ? 'bg-BG' : 'en-US';
  const today = new Date();
  const minStr = min ?? ymd(today);
  const selected = parse(value);

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [view, setView] = useState(() => {
    const base = selected ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const reposition = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8);
    setPos({ top: rect.bottom + 6, left: Math.max(8, left) });
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    // capture:true so this also fires for scroll on any scrollable ancestor
    // (e.g. a modal card), since scroll events don't bubble.
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dfTrigger = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric' });
  const dfHeader = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' });
  const dfWeekday = new Intl.DateTimeFormat(loc, { weekday: 'short' });
  const weekdays = Array.from({ length: 7 }, (_, i) => dfWeekday.format(new Date(2024, 0, 1 + i))); // 2024-01-01 = Monday

  const firstOfMonth = new Date(view.getFullYear(), view.getMonth(), 1);
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const lead = mondayIndex(firstOfMonth);
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shift = (n: number) => setView((v) => new Date(v.getFullYear(), v.getMonth() + n, 1));

  const popoverEl = open && pos && (
    <div ref={popoverRef} role="dialog" style={{ ...popover, top: pos.top, left: pos.left }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button type="button" onClick={() => shift(-1)} style={navBtn} aria-label="Prev">‹</button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, textTransform: 'capitalize' }}>
          {dfHeader.format(view)}
        </div>
        <button type="button" onClick={() => shift(1)} style={navBtn} aria-label="Next">›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {weekdays.map((w) => (
          <div key={w} className="mono" style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-3)', padding: '4px 0', textTransform: 'capitalize' }}>
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const str = ymd(d);
          const disabled = str < minStr;
          const isSel = value === str;
          const isToday = str === ymd(today);
          return (
            <button
              key={str}
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(str);
                setOpen(false);
              }}
              style={{
                height: 34,
                borderRadius: 8,
                border: isToday && !isSel ? '1px solid var(--teal)' : '1px solid transparent',
                background: isSel ? 'var(--lime)' : 'transparent',
                color: disabled ? 'var(--ink-3)' : isSel ? 'var(--on-lime)' : 'var(--ink)',
                opacity: disabled ? 0.4 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontWeight: isSel ? 700 : 500,
                fontSize: 14,
              }}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button ref={btnRef} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} style={trigger}>
        <span style={{ color: selected ? 'var(--ink)' : 'var(--ink-3)' }}>
          {selected ? dfTrigger.format(selected) : (placeholder ?? '—')}
        </span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--ink-3)" strokeWidth="1.4" aria-hidden>
          <rect x="2" y="3" width="12" height="11" rx="2" />
          <path d="M2 6h12M5 1.5v3M11 1.5v3" strokeLinecap="round" />
        </svg>
      </button>

      {mounted && popoverEl && createPortal(popoverEl, document.body)}
    </div>
  );
}

const trigger: React.CSSProperties = {
  minHeight: 46,
  width: '100%',
  padding: '0 12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 15,
};
const popover: React.CSSProperties = {
  position: 'fixed',
  zIndex: 1000,
  width: POPOVER_WIDTH,
  maxWidth: '90vw',
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow)',
  padding: 12,
};
const navBtn: React.CSSProperties = {
  width: 36,
  height: 36,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  fontSize: 18,
};
