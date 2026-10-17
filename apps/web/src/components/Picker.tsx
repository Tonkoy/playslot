'use client';

import { useEffect, useRef, useState } from 'react';

export interface PickerOption {
  value: string;
  label: string;
  /** Second line: e-mail, phone, anything that tells two people apart. */
  hint?: string | null;
}

const FIELD: React.CSSProperties = {
  minHeight: 40,
  width: '100%',
  padding: '0 34px 0 11px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
  fontSize: 14,
  boxSizing: 'border-box',
  textAlign: 'left',
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      width="16"
      height="16"
      style={{
        position: 'absolute',
        right: 10,
        top: '50%',
        transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
        transition: 'transform 140ms ease',
        pointerEvents: 'none',
        color: 'var(--ink-3)',
      }}
    >
      <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Shared dropdown panel, so every picker in the app opens the same way. */
function Panel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <ul
      id={id}
      role="listbox"
      style={{
        position: 'absolute',
        zIndex: 30,
        top: 'calc(100% + 5px)',
        left: 0,
        right: 0,
        margin: 0,
        padding: 4,
        listStyle: 'none',
        maxHeight: 240,
        overflowY: 'auto',
        background: 'var(--surface)',
        border: '1px solid var(--line-2)',
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'var(--shadow)',
      }}
    >
      {children}
    </ul>
  );
}

function Row({
  option,
  active,
  selected,
  onHover,
  onPick,
}: {
  option: PickerOption;
  active: boolean;
  selected: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onMouseEnter={onHover}
        onClick={onPick}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          padding: option.hint ? '7px 9px' : '8px 9px',
          border: 'none',
          borderRadius: 8,
          background: active ? 'var(--green-soft)' : 'transparent',
          color: 'var(--ink)',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        <span style={{ fontWeight: selected ? 700 : 500, fontSize: 14 }}>{option.label}</span>
        {option.hint && (
          <span className="mono" style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>
            {option.hint}
          </span>
        )}
      </button>
    </li>
  );
}

/** Close on an outside click — shared by both pickers below. */
function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);
  return ref;
}

/**
 * Styled replacement for a native <select>: same keyboard behaviour, but it
 * looks like the rest of the app instead of like the operating system.
 */
export function Select({
  options,
  value,
  onChange,
  id,
  ariaLabel,
}: {
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const ref = useOutside(open, () => setOpen(false));
  const listId = `${id ?? 'select'}-options`;
  const current = options.find((o) => o.value === value);

  const pick = (option: PickerOption) => {
    onChange(option.value);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => {
          setActive(Math.max(0, options.findIndex((o) => o.value === value)));
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) return setOpen(true);
            setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % options.length : (i - 1 + options.length) % options.length));
          } else if (open && e.key === 'Enter') {
            e.preventDefault();
            pick(options[active]!);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        style={{ ...FIELD, cursor: 'pointer', borderColor: open ? 'var(--green)' : 'var(--line-2)' }}
      >
        {current?.label ?? ''}
      </button>
      <Chevron open={open} />
      {open && (
        <Panel id={listId}>
          {options.map((o, i) => (
            <Row
              key={o.value}
              option={o}
              active={i === active}
              selected={o.value === value}
              onHover={() => setActive(i)}
              onPick={() => pick(o)}
            />
          ))}
        </Panel>
      )}
    </div>
  );
}

/**
 * Type-to-filter picker. `onQueryChange` lets the caller fetch matches from the
 * server instead of filtering the given list; `allowFreeText` keeps whatever
 * was typed as a value of its own (a walk-in with no account).
 */
export function Combobox({
  options,
  value,
  text,
  onPick,
  onText,
  placeholder,
  loading = false,
  emptyHint,
  allowFreeText = false,
  id,
}: {
  options: PickerOption[];
  /** The chosen option's value, or null when nothing is chosen. */
  value: string | null;
  /** What the field shows: the chosen label, or free text being typed. */
  text: string;
  onPick: (option: PickerOption) => void;
  onText: (text: string) => void;
  placeholder?: string;
  loading?: boolean;
  emptyHint?: string;
  allowFreeText?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useOutside(open, () => setOpen(false));
  const listId = `${id ?? 'combobox'}-options`;

  const pick = (option: PickerOption) => {
    onPick(option);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={text}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') return setOpen(false);
          if (options.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => (i + 1) % options.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => (i - 1 + options.length) % options.length);
          } else if (e.key === 'Enter' && open) {
            e.preventDefault();
            pick(options[active]!);
          }
        }}
        style={{ ...FIELD, borderColor: open || value ? 'var(--green)' : 'var(--line-2)' }}
      />
      <Chevron open={open} />
      {open && (
        <Panel id={listId}>
          {loading && <li style={HINT}>…</li>}
          {!loading && options.length === 0 && emptyHint && <li style={HINT}>{emptyHint}</li>}
          {options.map((o, i) => (
            <Row
              key={o.value}
              option={o}
              active={i === active}
              selected={o.value === value}
              onHover={() => setActive(i)}
              onPick={() => pick(o)}
            />
          ))}
          {allowFreeText && text.trim() && options.length === 0 && !loading && <li style={HINT} aria-hidden />}
        </Panel>
      )}
    </div>
  );
}

const HINT: React.CSSProperties = { padding: '9px', fontSize: 13, color: 'var(--ink-3)' };
